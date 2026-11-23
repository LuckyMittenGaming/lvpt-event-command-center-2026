package pairui

import "errors"

type Protector interface {
	Protect(plain []byte) ([]byte, error)
	Unprotect(blob []byte) ([]byte, error)
}

type keyedProtector struct {
	key []byte
}

func NewKeyedProtector(key []byte) Protector {
	return keyedProtector{key: append([]byte(nil), key...)}
}

func (p keyedProtector) Protect(plain []byte) ([]byte, error) {
	if len(p.key) != 32 {
		return nil, errors.New("missing encryption key")
	}
	return seal(p.key, plain)
}

func (p keyedProtector) Unprotect(blob []byte) ([]byte, error) {
	if len(p.key) != 32 {
		return nil, errors.New("missing encryption key")
	}
	return open(p.key, blob)
}
