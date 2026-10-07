package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"wsdlparser/internal/appdir"
	"wsdlparser/internal/server"
	d3 "wsdlparser/visualizations/D3"
)

const defaultServeAddr = "127.0.0.1:8765"

func runServe(args []string) error {
	fs := flag.NewFlagSet("wsdlparser serve", flag.ContinueOnError)
	addr := fs.String("addr", defaultServeAddr, "loopback address to listen on (host:port)")
	noOpen := fs.Bool("no-open", false, "do not open the browser")
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "Usage: wsdlparser serve [flags]")
		fmt.Fprintln(fs.Output(), "Serves the Enterprise WSDL Explorer for the files in ~/Documents/go-data-discovery/wsdl.")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() > 0 {
		return fmt.Errorf("serve takes no arguments, got %q", fs.Arg(0))
	}

	explicit := false
	fs.Visit(func(f *flag.Flag) { explicit = explicit || f.Name == "addr" })

	if err := requireLoopback(*addr); err != nil {
		return err
	}
	root, err := appdir.Root()
	if err != nil {
		return err
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil && !explicit && errors.Is(err, syscall.EADDRINUSE) {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
	}
	if err != nil {
		return fmt.Errorf("listening on %s: %w", *addr, err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var open func(string) error
	if !*noOpen {
		open = openBrowser
	}
	return serve(ctx, ln, root, os.Stdout, open)
}

func serve(ctx context.Context, ln net.Listener, root string, out io.Writer, open func(string) error) error {
	srv := &http.Server{
		Handler:           server.Handler(root, d3.FS),
		ReadHeaderTimeout: 10 * time.Second,
	}
	url := "http://" + ln.Addr().String() + "/"
	fmt.Fprintf(out, "Serving the Enterprise WSDL Explorer at %s\nWSDL files are read from %s\nPress Ctrl+C to stop.\n", url, root+string(os.PathSeparator)+"wsdl")
	if open != nil {
		if err := open(url); err != nil {
			fmt.Fprintf(out, "Could not open a browser (%v); open the URL above manually.\n", err)
		}
	}

	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	}
}

// requireLoopback refuses addresses that would expose the server beyond this machine.
func requireLoopback(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("invalid -addr %q: %w", addr, err)
	}
	if host == "localhost" {
		return nil
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		return nil
	}
	return fmt.Errorf("-addr %q is not a loopback address; the server only listens on localhost", addr)
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
