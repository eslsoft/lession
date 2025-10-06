package cmd

import (
	"context"
	"os"

	"github.com/spf13/cobra"
)

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "lession",
	Short: "Lesson service CLI",
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// WithRootContext allows external callers to inject a context when executing the CLI.
func WithRootContext(ctx context.Context) {
	rootCmd.SetContext(ctx)
}
