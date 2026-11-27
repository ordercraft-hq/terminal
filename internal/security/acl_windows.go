//go:build windows

package security

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

// EnforcePrivateFilePermissions restricts a file on Windows NTFS to grant
// access exclusively to the current process user SID and blocks inherited ACLs.
func EnforcePrivateFilePermissions(path string) error {
	return setOwnerOnlyDACL(path, false)
}

// EnforcePrivateDirPermissions restricts a directory on Windows NTFS to grant
// access exclusively to the current process user SID and blocks inherited ACLs.
func EnforcePrivateDirPermissions(path string) error {
	return setOwnerOnlyDACL(path, true)
}

func setOwnerOnlyDACL(path string, isDir bool) error {
	if path == "" || path == ":memory:" {
		return nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if isDir && !info.IsDir() {
		return fmt.Errorf("expected directory at %s", path)
	}

	var token windows.Token
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		return fmt.Errorf("open process token: %w", err)
	}
	defer token.Close()

	tokenUser, err := token.GetTokenUser()
	if err != nil {
		return fmt.Errorf("query token user: %w", err)
	}

	inheritance := uint32(windows.NO_INHERITANCE)
	if isDir {
		inheritance = windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT
	}

	entries := []windows.EXPLICIT_ACCESS{
		{
			AccessPermissions: windows.GENERIC_ALL,
			AccessMode:        windows.SET_ACCESS,
			Inheritance:       inheritance,
			Trustee: windows.TRUSTEE{
				TrusteeForm:  windows.TRUSTEE_IS_SID,
				TrusteeType:  windows.TRUSTEE_IS_USER,
				TrusteeValue: windows.TrusteeValueFromSID(tokenUser.User.Sid),
			},
		},
	}

	acl, err := windows.ACLFromEntries(entries, nil)
	if err != nil {
		return fmt.Errorf("build ACL: %w", err)
	}

	err = windows.SetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		nil,
		nil,
		acl,
		nil,
	)
	if err != nil {
		return fmt.Errorf("set Windows DACL on %s: %w", path, err)
	}
	return nil
}
