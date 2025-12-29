FROM golang:1.25.3-alpine AS builder

WORKDIR /app

RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 go build -o cloudtorrent .

FROM alpine:latest

WORKDIR /app

RUN apk add --no-cache ca-certificates ffmpeg

COPY --from=builder /app/cloudtorrent .
COPY --from=builder /app/static ./static

RUN mkdir -p /app/downloads

EXPOSE 8080
VOLUME ["/app/downloads"]

CMD ["./cloudtorrent"]
