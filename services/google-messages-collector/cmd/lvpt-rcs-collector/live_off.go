//go:build !livelibgm

package main

import "errors"

func runLiveTest() error {
	return errors.New("authorized live test requires go build -tags livelibgm; no Google session was opened")
}
