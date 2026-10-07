package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"strings"
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
	var body []byte
	for i := 0; i < 50; i++ {
		resp, err := http.Get(url)
		if err == nil {
			body, _ = io.ReadAll(resp.Body)
			resp.Body.Close()
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !strings.Contains(string(body), "Enterprise WSDL Explorer") && !strings.Contains(string(body), "<html") {
		t.Errorf("embedded SPA not served: %.80q", body)
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
