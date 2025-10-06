package cmd

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/spf13/cobra"

	appserver "github.com/eslsoft/lession/internal/app/server"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the lesson HTTP server",
	RunE: func(cmd *cobra.Command, args []string) error {
		_ = godotenv.Load()

		srv, err := appserver.InitializeServer()
		if err != nil {
			return err
		}

		ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		return srv.Run(ctx)
	},
}

func init() {
	rootCmd.AddCommand(serveCmd)
}
