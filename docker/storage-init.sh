#!/bin/sh
set -eu
case "$S3_BUCKET" in ''|*[!a-z0-9.-]*) echo 'Invalid bucket name' >&2; exit 1;; esac
mc alias set storage http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "storage/$S3_BUCKET" >/dev/null
cat > /tmp/dineflow-policy.json <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::$S3_BUCKET"]},{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],"Resource":["arn:aws:s3:::$S3_BUCKET/*"]}]}
EOF
if ! mc admin user info storage "$S3_ACCESS_KEY_ID" >/dev/null 2>&1; then
  mc admin user add storage "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
fi
mc admin policy create storage dineflow-storage /tmp/dineflow-policy.json >/dev/null
mc admin policy attach storage dineflow-storage --user "$S3_ACCESS_KEY_ID" >/dev/null
mc alias set app http://minio:9000 "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
mc stat "app/$S3_BUCKET" >/dev/null
echo 'Private image bucket and scoped API storage user ready.'
