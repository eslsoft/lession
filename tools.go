//go:build tools
// +build tools

package tools

import (
	_ "entgo.io/ent/cmd/ent"
	_ "github.com/bufbuild/buf/cmd/buf"
	_ "github.com/google/wire/cmd/wire"
)
