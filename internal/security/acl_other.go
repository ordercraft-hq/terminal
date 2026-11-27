//go:build !windows

package security

import "os"

// EnforcePrivateFilePermissions restricts a file to 0600 on POSIX platforms.
func EnforcePrivateFilePermissions(path string) error {
	if path == "" || path == ":memory:" {
		return nil
	}
	return os.Chmod(path, 0600)
}

// EnforcePrivateDirPermissions restricts a directory to 0700 on POSIX platforms.
func EnforcePrivateDirPermissions(path string) error {
	if path == "" || path == ":memory:" {
		return nil
	}
	return os.Chmod(path, 0700)
}
