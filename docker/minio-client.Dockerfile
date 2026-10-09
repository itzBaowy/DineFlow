FROM golang:1.25-alpine AS build
RUN apk add --no-cache git
ENV CGO_ENABLED=0
RUN go install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/mc /usr/local/bin/mc
COPY docker/storage-init.sh /usr/local/bin/storage-init.sh
ENV MC_CONFIG_DIR=/tmp/mc
ENTRYPOINT ["sh", "/usr/local/bin/storage-init.sh"]
