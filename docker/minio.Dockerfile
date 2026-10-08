# Upstream ships source only for this security release; build the pinned release.
FROM golang:1.25-alpine AS build
RUN apk add --no-cache git
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z \
    && cp /go/pkg/mod/github.com/minio/minio@*/LICENSE /go/LICENSE

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --from=build /go/LICENSE /licenses/minio-AGPL-3.0.txt
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
