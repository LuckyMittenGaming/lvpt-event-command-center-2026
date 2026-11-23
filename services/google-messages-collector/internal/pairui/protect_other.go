//go:build !windows

package pairui

import "errors"

func NewOSProtector() (Protector, error) {
	return nil, errors.New("OS key protection requires Windows")
}
