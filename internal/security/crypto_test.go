package security

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCipher_EncryptDecrypt(t *testing.T) {
	key := make([]byte, KeySize)
	for i := range key {
		key[i] = byte(i)
	}

	c, err := NewCipher(key)
	if err != nil {
		t.Fatalf("Failed to create cipher: %v", err)
	}

	plaintext := `{"apiKey":"PKTEST123456","apiSecret":"secret_abcdef123456"}`

	// 1. Encrypt
	encrypted, err := c.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Must have envelope prefix
	if !strings.HasPrefix(encrypted, EnvelopePrefix) {
		t.Fatalf("Expected envelope prefix %q, got %q", EnvelopePrefix, encrypted)
	}

	// Must NOT contain any plaintext substring
	if strings.Contains(encrypted, "PKTEST123456") || strings.Contains(encrypted, "secret_abcdef123456") {
		t.Fatalf("Security failure: encrypted output leaked plaintext! Got: %s", encrypted)
	}

	// 2. Decrypt
	decrypted, err := c.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if decrypted != plaintext {
		t.Fatalf("Decrypted mismatch. Expected %q, got %q", plaintext, decrypted)
	}

	// 3. Different ciphertexts for same plaintext (unique nonces)
	encrypted2, err := c.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Second Encrypt failed: %v", err)
	}
	if encrypted == encrypted2 {
		t.Fatalf("Security failure: two encryptions produced identical ciphertext (nonce reuse)")
	}

	// 4. Decrypt second ciphertext
	decrypted2, err := c.Decrypt(encrypted2)
	if err != nil || decrypted2 != plaintext {
		t.Fatalf("Second decrypt failed: %v, got %q", err, decrypted2)
	}
}

func TestCipher_TamperResistance(t *testing.T) {
	key := make([]byte, KeySize)
	c, _ := NewCipher(key)

	encrypted, err := c.Encrypt("super_secret_key")
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Tamper with the base64 payload
	tampered := encrypted[:len(encrypted)-4] + "AAAA"
	_, err = c.Decrypt(tampered)
	if err == nil {
		t.Fatalf("Expected tamper detection failure, but decrypt succeeded")
	}
}

func TestCipher_LegacyPlaintextFallback(t *testing.T) {
	key := make([]byte, KeySize)
	c, _ := NewCipher(key)

	// An existing unencrypted key stored before v0.1.1
	legacyPlaintext := `{"apiKey":"PKOLD123","apiSecret":"secret_old"}`

	decrypted, err := c.Decrypt(legacyPlaintext)
	if err != nil {
		t.Fatalf("Legacy fallback failed: %v", err)
	}
	if decrypted != legacyPlaintext {
		t.Fatalf("Expected legacy plaintext returned unchanged, got: %q", decrypted)
	}
}

func TestResolveMasterKey_FileLifecycle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "ordercraft_key_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	keyPath := filepath.Join(tmpDir, ".ordercraft.key")

	// 1. First resolution should generate and save key
	key1, err := ResolveMasterKey(keyPath)
	if err != nil {
		t.Fatalf("ResolveMasterKey failed: %v", err)
	}
	if len(key1) != KeySize {
		t.Fatalf("Expected key size %d, got %d", KeySize, len(key1))
	}

	// Key file must now exist
	if _, err := os.Stat(keyPath); err != nil {
		t.Fatalf("Key file was not created: %v", err)
	}

	// 2. Second resolution should read identical key
	key2, err := ResolveMasterKey(keyPath)
	if err != nil {
		t.Fatalf("Second ResolveMasterKey failed: %v", err)
	}
	for i := range key1 {
		if key1[i] != key2[i] {
			t.Fatalf("Keys do not match across resolutions at index %d", i)
		}
	}
}

func TestResolveMasterKey_EnvVar(t *testing.T) {
	customKey := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	os.Setenv("ORDERCRAFT_ENCRYPTION_KEY", customKey)
	defer os.Unsetenv("ORDERCRAFT_ENCRYPTION_KEY")

	key, err := ResolveMasterKey(":memory:")
	if err != nil {
		t.Fatalf("ResolveMasterKey with env var failed: %v", err)
	}
	if len(key) != KeySize {
		t.Fatalf("Expected key size %d, got %d", KeySize, len(key))
	}
}

