module hubstore/batching-service

go 1.19

require (
	github.com/jackc/pgx/v5 v5.5.5
	google.golang.org/grpc v1.56.3
	google.golang.org/protobuf v1.30.0
	hubstore/gen/go v0.0.0-00010101000000-000000000000
)

require (
	github.com/golang/protobuf v1.5.3 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.17.0 // indirect
	golang.org/x/net v0.17.0 // indirect
	golang.org/x/sync v0.17.0 // indirect
	golang.org/x/sys v0.15.0 // indirect
	golang.org/x/text v0.29.0 // indirect
	google.golang.org/genproto v0.0.0-20230410155749-daa745c078e1 // indirect
)

replace hubstore/gen/go => ../../api/proto/gen/go
