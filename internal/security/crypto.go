package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	// EnvelopePrefix identifies version 1 AES-256-GCM encrypted payloads
	EnvelopePrefix = "enc:v1:"
	// KeySize is 32 bytes for AES-256
	KeySize = 32
	// NonceSize standard for GCM is 12 bytes
	NonceSize = 12
)

// Cipher provides authenticated encryption and decryption for sensitive credentials.
type Cipher struct {
	aead cipher.AEAD
}

// NewCipher creates an AES-256-GCM cipher with the given 32-byte key.
func NewCipher(key []byte) (*Cipher, error) {
	if len(key) != KeySize {
		return nil, fmt.Errorf("invalid key length: got %d bytes, expected %d", len(key), KeySize)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher: %w", err)
	}

	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM AEAD: %w", err)
	}

	return &Cipher{aead: aead}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM with a random nonce
// and returns an enveloped string: "enc:v1:" + base64(nonce + ciphertext + tag)
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	nonce := make([]byte, NonceSize)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate random nonce: %w", err)
	}

	// Seal appends ciphertext + 16-byte tag to nonce
	ciphertext := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return EnvelopePrefix + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts an enveloped ciphertext string.
// If the input is not enveloped with "enc:v1:", it is treated as legacy unencrypted
// plaintext for backward compatibility.
func (c *Cipher) Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}

	if !strings.HasPrefix(ciphertext, EnvelopePrefix) {
		// Legacy unencrypted plaintext fallback
		return ciphertext, nil
	}

	rawB64 := strings.TrimPrefix(ciphertext, EnvelopePrefix)
	data, err := base64.StdEncoding.DecodeString(rawB64)
	if err != nil {
		return "", fmt.Errorf("invalid base64 encrypted payload: %w", err)
	}

	if len(data) < NonceSize+c.aead.Overhead() {
		return "", errors.New("ciphertext too short")
	}

	nonce := data[:NonceSize]
	actualCiphertext := data[NonceSize:]

	plaintext, err := c.aead.Open(nil, nonce, actualCiphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt or authenticate payload: %w", err)
	}

	return string(plaintext), nil
}

func isPlaceholderKey(val string) bool {
	low := strings.ToLower(strings.TrimSpace(val))
	return low == "" ||
		strings.Contains(low, "your_") ||
		strings.Contains(low, "placeholder") ||
		strings.Contains(low, "changeme")
}

// ResolveMasterKey derives or retrieves the 32-byte AES key.
// Priority order:
// 1. ORDERCRAFT_ENCRYPTION_KEY / ORDERCRAFT_MASTER_KEY environment variable.
// 2. Local master key file at keyFilePath (created with owner-only permissions if non-existent).
// 3. Ephemeral random key if keyFilePath is empty or in-memory.
func ResolveMasterKey(keyFilePath string) ([]byte, error) {
	// 1. Check environment variables
	for _, envVar := range []string{"ORDERCRAFT_ENCRYPTION_KEY", "ORDERCRAFT_MASTER_KEY"} {
		if rawVal, set := os.LookupEnv(envVar); set {
			val := strings.TrimSpace(rawVal)
			if val == "" {
				continue
			}
			if isPlaceholderKey(val) {
				return nil, fmt.Errorf("%s contains an insecure placeholder key; remove it or set a 32-byte hex/base64 secret", envVar)
			}
			return normalizeKeyString(val), nil
		}
	}

	// 2. In-memory or empty path -> generate ephemeral key
	if keyFilePath == "" || keyFilePath == ":memory:" {
		key := make([]byte, KeySize)
		if _, err := io.ReadFull(rand.Reader, key); err != nil {
			return nil, fmt.Errorf("failed to generate ephemeral key: %w", err)
		}
		return key, nil
	}

	// 3. File-based master key
	if info, err := os.Stat(keyFilePath); err == nil {
		if info.IsDir() {
			return nil, fmt.Errorf("key path %s is a directory", keyFilePath)
		}
		if err := EnforcePrivateFilePermissions(keyFilePath); err != nil {
			return nil, fmt.Errorf("failed to enforce permissions on key file %s: %w", keyFilePath, err)
		}
		raw, err := os.ReadFile(keyFilePath)
		if err != nil {
			return nil, fmt.Errorf("failed to read key file %s: %w", keyFilePath, err)
		}
		trimmed := strings.TrimSpace(string(raw))
		if isPlaceholderKey(trimmed) {
			return nil, fmt.Errorf("key file %s is empty or contains a placeholder key", keyFilePath)
		}
		return normalizeKeyString(trimmed), nil
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to stat key file %s: %w", keyFilePath, err)
	}

	// Keyfile does not exist - generate new 32 random bytes
	key := make([]byte, KeySize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("failed to generate random key: %w", err)
	}

	if dir := filepath.Dir(keyFilePath); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, fmt.Errorf("failed to create key directory: %w", err)
		}
		_ = EnforcePrivateDirPermissions(dir)
	}

	// Save with strict owner-only permissions (0600 on Unix + owner-only DACL on Windows)
	encoded := hex.EncodeToString(key)
	f, err := os.OpenFile(keyFilePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil, fmt.Errorf("failed to create key file %s: %w", keyFilePath, err)
	}
	if _, writeErr := f.Write([]byte(encoded)); writeErr != nil {
		_ = f.Close()
		return nil, fmt.Errorf("failed to write key file %s: %w", keyFilePath, writeErr)
	}
	if closeErr := f.Close(); closeErr != nil {
		return nil, fmt.Errorf("failed to close key file %s: %w", keyFilePath, closeErr)
	}
	if err := EnforcePrivateFilePermissions(keyFilePath); err != nil {
		return nil, fmt.Errorf("failed to enforce permissions on new key file %s: %w", keyFilePath, err)
	}

	return key, nil
}

func normalizeKeyString(val string) []byte {
	// If hex encoded 64 chars
	if len(val) == 64 {
		if decoded, err := hex.DecodeString(val); err == nil && len(decoded) == KeySize {
			return decoded
		}
	}
	// If base64 encoded
	if decoded, err := base64.StdEncoding.DecodeString(val); err == nil && len(decoded) == KeySize {
		return decoded
	}
	// Fallback: SHA-256 hash of arbitrary password/passphrase
	hash := sha256.Sum256([]byte(val))
	return hash[:]
}

func normalizeKeyBytes(raw []byte) []byte {
	str := strings.TrimSpace(string(raw))
	return normalizeKeyString(str)
}

