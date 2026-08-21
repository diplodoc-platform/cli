package main

import "example.com/sdk"

func main() {
	// #region connect
	db, err := sdk.Open(ctx, dsn)
	if err != nil {
		return err
	}
	// #endregion connect
}
