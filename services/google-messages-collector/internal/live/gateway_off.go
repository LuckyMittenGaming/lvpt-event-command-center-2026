//go:build !livelibgm

package live

import "errors"

func LiveGateway() (Gateway, error) {
	return nil, errors.New("authorized live test requires go build -tags livelibgm; no Google session was opened")
}
