#!/bin/bash
# Helper to run Aurora locally against an Amazon RDS / Aurora Postgres instance.
# Usage: source Aurora/setup_rds_local.sh
# Then run: cd Aurora && npm run web

if [ -z "$AWS_DB_URL" ] && [ -z "$AWS_DB_HOST" ]; then
  echo "Please set AWS_DB_URL or AWS_DB_HOST/AWS_DB_USER/AWS_DB_PASSWORD/AWS_DB_NAME"
  return 1 2>/dev/null || exit 1
fi

export AWS_DB_SSL=${AWS_DB_SSL:-require}
# If you have a CA file for the RDS cluster, set AWS_DB_SSL_CA_PATH to its path.

echo "AWS RDS environment prepared:
  AWS_DB_HOST=$AWS_DB_HOST
  AWS_DB_NAME=$AWS_DB_NAME
  AWS_DB_USER=$AWS_DB_USER
  AWS_DB_SSL=$AWS_DB_SSL"
