//go:build windows

package pairui

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

type dpapiProtector struct{}

func NewOSProtector() (Protector, error) {
	return dpapiProtector{}, nil
}

func (dpapiProtector) Protect(plain []byte) ([]byte, error) {
	in := blobFrom(plain)
	var out windows.DataBlob
	if err := windows.CryptProtectData(&in, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(uintptr(unsafe.Pointer(out.Data))))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}

func (dpapiProtector) Unprotect(sealed []byte) ([]byte, error) {
	in := blobFrom(sealed)
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(&in, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(uintptr(unsafe.Pointer(out.Data))))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}

func blobFrom(value []byte) windows.DataBlob {
	var blob windows.DataBlob
	blob.Size = uint32(len(value))
	if len(value) > 0 {
		blob.Data = &value[0]
	}
	return blob
}
