#!/bin/bash
set -e

echo "🚀 Starting deployment process..."

# Change to CDK directory
cd cdk

echo "📦 Building CDK project..."
pnpm run build

echo "🔧 Deploying CDK stack..."
pnpx cdk deploy --require-approval never

echo "✅ Deployment completed successfully!"
echo "🌐 Frontend will be automatically deployed to S3 with the correct WebSocket URL"