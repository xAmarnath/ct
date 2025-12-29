FROM golang:1.25.3-alpine AS builder

WORKDIR /srv

RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Rename output binary
RUN CGO_ENABLED=1 go build -o appserver .

FROM alpine:latest

WORKDIR /srv

RUN apk add --no-cache ca-certificates ffmpeg

COPY --from=builder /srv/appserver ./appserver
COPY --from=builder /srv/static ./static

RUN mkdir -p /srv/data

EXPOSE 8080
VOLUME ["/srv/data"]

CMD ["./appserver"]
