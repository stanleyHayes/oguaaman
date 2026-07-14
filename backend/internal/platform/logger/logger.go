// Package logger provides a small structured logger built on log/slog.
package logger

import (
	"log/slog"
	"os"
)

// New returns a JSON structured logger writing to stdout.
func New() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}
