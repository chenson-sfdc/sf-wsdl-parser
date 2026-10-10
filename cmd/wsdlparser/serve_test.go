package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestRequireLoopback(t *testing.T) {
	for _, ok := range []string{"127.0.0.1:8765", "localhost:80", "[::1]:9", "127.0.0.2:1"} {
		if err := requireLoopback(ok); err != nil {
			t.Errorf("%s: %v", ok, err)
		}
	}
	for _, bad := range []string{"0.0.0.0:8765", ":8765", "192.168.1.5:80", "example.com:80", "nonsense"} {
		if err := requireLoopback(bad); err == nil {
			t.Errorf("%s: expected an error", bad)
		}
	}
}

func TestServeServesSPAAndStopsOnCancel(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	var out bytes.Buffer
	var opened string
	done := make(chan error, 1)
	go func() {
		done <- serve(ctx, ln, t.TempDir(), &out, func(u string) error { opened = u; return nil })
	}()

	url := "http://" + ln.Addr().String() + "/"
	// What / contains depends on whether web/build was built (an unbuilt tree
	// embeds only .gitkeep), so check that the server answers, not the markup.
	var status int
	var csp string
	for i := 0; i < 50; i++ {
		resp, err := http.Get(url)
		if err == nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			status, csp = resp.StatusCode, resp.Header.Get("Content-Security-Policy")
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if status != http.StatusOK || csp == "" {
		t.Errorf("embedded SPA not served: status %d, CSP %q", status, csp)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("serve returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("serve did not stop after cancel")
	}
	if opened != url {
		t.Errorf("opened %q, want %q", opened, url)
	}
}

func TestServeRejectsArgs(t *testing.T) {
	if err := run([]string{"serve", "file.wsdl"}); err == nil {
		t.Error("expected an error for a positional argument")
	}
	if err := run([]string{"serve", "-addr", "0.0.0.0:1"}); err == nil {
		t.Error("expected an error for a non-loopback address")
	}
}

func TestBoundToLoopback(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if err := boundToLoopback(ln); err != nil {
		t.Errorf("loopback listener refused: %v", err)
	}
	if err := boundToLoopback(fakeAddrListener{ln, &net.TCPAddr{IP: net.IPv4(192, 168, 1, 5), Port: 1}}); err == nil {
		t.Error("a LAN address was accepted")
	}
}

type fakeAddrListener struct {
	net.Listener
	addr net.Addr
}

func (f fakeAddrListener) Addr() net.Addr { return f.addr }
