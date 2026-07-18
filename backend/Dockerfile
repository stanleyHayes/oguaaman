# Oguaa API — multi-stage Go build. Produces the server plus full and safe seeders.
FROM golang:1.25 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/server ./cmd/server \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/seed ./cmd/seed \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/seedmissing ./cmd/seedmissing

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app \
 && mkdir -p /app/uploads && chown -R app:app /app
COPY --from=build /out/server /out/seed /out/seedmissing /usr/local/bin/
WORKDIR /app
USER app
EXPOSE 8080 50051
CMD ["server"]
