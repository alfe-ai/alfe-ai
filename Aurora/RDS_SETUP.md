# Setting up Amazon RDS (Aurora PostgreSQL) for Aurora

Follow these steps to create an Amazon RDS (Aurora PostgreSQL) instance and configure Aurora to use it:

1. Sign in to the AWS Console and open the RDS service.
2. Choose "Create database" and select "Amazon Aurora". For compatibility choose "PostgreSQL".
3. Choose the instance class and storage options appropriate for your workload.
4. Under "Credentials", set the master username and password. Save these — they will be used in your app.
5. Configure connectivity: place the cluster in a VPC/subnet the application can reach.
   - If running Aurora on your local machine or a server outside the VPC, enable Public accessibility and configure the DB security group to allow inbound connections from your IP on port 5432 (or the port you chose).
   - For production, run the application inside the same VPC or attach appropriate networking (VPC peering, Transit Gateway, etc.).
6. (Optional) Enable SSL connections. Download the AWS RDS CA bundle if you want to require SSL from the client.
7. Create the database name (if not already created).
8. Note the endpoint (host) and port. The full connection string looks like:

   postgres://username:password@your-cluster.cluster-xxxxxxxxxxxx.us-east-1.rds.amazonaws.com:5432/dbname

9. Set environment variables for Aurora to use the DB: either set `AWS_DB_URL` to the full connection string, or configure these individually:

   - `AWS_DB_HOST`=your-cluster.cluster-xxxxxxxxxxxx.us-east-1.rds.amazonaws.com
   - `AWS_DB_USER`=username
   - `AWS_DB_PASSWORD`=password
   - `AWS_DB_NAME`=dbname
   - `AWS_DB_PORT`=5432

Using AWS Secrets Manager

- If you store your RDS credentials in AWS Secrets Manager, set the secret id and region before starting Aurora:
  - `AWS_SECRETS_MANAGER_SECRET_ID`=your-secret-id
  - `AWS_SECRETS_MANAGER_REGION`=us-west-2 (optional; defaults to `AWS_REGION` or `us-west-2`)
- The secret can be a JSON document with keys like `username`, `password`, `host`, `dbname`, and `port`, or a full connection string under `url`/`connectionString`.

Security notes

- Protect your DB credentials; do not commit them to source control. Use a secrets manager or environment variables.
- Restrict the RDS security group to only the hosts that need access. Avoid opening to 0.0.0.0/0.

Troubleshooting

- If you see connection errors, verify network connectivity (ping/traceroute not always allowed), that the port is open, and that the DB is accepting connections. Check the RDS logs in the AWS console.
