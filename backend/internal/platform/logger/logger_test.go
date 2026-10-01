package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestMaskContact(t *testing.T) {
	cases := map[string]string{
		"ama.mensah@example.com": "a***@example.com",
		"+233240000012":          "+23324*****12",
		"0240":                   "**40",
		"":                       "",
	}
	for in, want := range cases {
		if got := MaskContact(in); got != want {
			t.Errorf("MaskContact(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLoggerRedactsContactAttributes(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{ReplaceAttr: RedactAttr}))
	log.Info("send failed", "to", "ama@example.com", "phone", "+233240000012", "memberId", "m-1")
	out := buf.String()
	if strings.Contains(out, "ama@example.com") || strings.Contains(out, "+233240000012") {
		t.Fatalf("contact details leaked: %s", out)
	}
	if !strings.Contains(out, `"memberId":"m-1"`) {
		t.Fatalf("non-contact attribute masked: %s", out)
	}
}

func TestSecurityEventShape(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, nil))
	ctx := WithActor(WithClientIP(context.Background(), "203.0.113.9"), "m-steward")
	Security(ctx, log, EventRoleChanged, "memberId", "m-1")
	var got map[string]any
	if err := json.Unmarshal(buf.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["type"] != "security" || got["event"] != EventRoleChanged || got["ip"] != "203.0.113.9" || got["memberId"] != "m-1" || got["actorId"] != "m-steward" {
		t.Fatalf("event = %v", got)
	}
}

func TestHashIdentifierIsKeyedAndNormalised(t *testing.T) {
	a := HashIdentifier([]byte("key-1"), " Ama@Example.com ")
	if a != HashIdentifier([]byte("key-1"), "ama@example.com") {
		t.Error("hash not normalised")
	}
	if a == HashIdentifier([]byte("key-2"), "ama@example.com") {
		t.Error("hash not keyed")
	}
	if len(a) != 16 || strings.Contains(a, "ama") {
		t.Errorf("hash = %q", a)
	}
	if HashIdentifier([]byte("key-1"), "  ") != "" {
		t.Error("blank identifier should hash to empty")
	}
}
