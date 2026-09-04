// Package logging — SF-12 (FI-257) structured JSON logs.
//
// go 1.19 không có slog — helper tối tiểu: 1 dòng JSON ra stdout cho mỗi
// event, shape {ts, level, msg, ...kv}. Dùng cho đường auth/health (spec §3.3);
// các đường khác chuyển dần khi đụng tới (reconcile T10).
//
// Usage:
//
//	logging.Info("batches DB ready", "component", "batching", "db", name)
//	logging.Warn("x-user-role lệch token claim", "meta_role", m, "token_role", r)
//	logging.Fatal("serve: %v" -> msg + kv, tự os.Exit(1))
package logging

import (
	"encoding/json"
	"log"
	"os"
	"time"
)

// JSON — emit 1 dòng JSON {ts, level, msg, ...kv} ra stdout.
//
// kv là flat key/value pairs ("key1", "val1", "key2", "val2", ...); key lẻ
// cuối (thiếu value) bị bỏ qua. Marshal lỗi (rất khó xảy ra với map[string]string)
// → fallback log.Printf, không bao giờ panic.
func JSON(level, msg string, kv ...string) {
	fields := map[string]string{
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"level": level,
		"msg":   msg,
	}
	for i := 0; i+1 < len(kv); i += 2 {
		fields[kv[i]] = kv[i+1]
	}
	b, err := json.Marshal(fields)
	if err != nil {
		log.Printf("logging: marshal: %v (msg=%q level=%q)", err, msg, level)
		return
	}
	b = append(b, '\n')
	_, _ = os.Stdout.Write(b)
}

func Info(msg string, kv ...string)  { JSON("info", msg, kv...) }
func Warn(msg string, kv ...string)  { JSON("warn", msg, kv...) }
func Error(msg string, kv ...string) { JSON("error", msg, kv...) }

// Fatal — emit level "fatal" rồi os.Exit(1) (thay log.Fatalf ở boot path).
func Fatal(msg string, kv ...string) {
	JSON("fatal", msg, kv...)
	os.Exit(1)
}
