#!/bin/bash

# Build and Push Polling Service Docker Image to ECR
# This script builds the polling service Docker image and pushes it to ECR

set -e  # Exit on any error

echo "🚀 Building and pushing FF Polling Service to ECR..."

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-west-2")
ECR_REPO_NAME="ff-polling-service"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "📍 AWS Account: ${AWS_ACCOUNT_ID}"
echo "📍 Region: ${AWS_REGION}"
echo "📍 ECR Repository: ${ECR_URI}"

# Navigate to repo root (needed for Docker context to access packages/ff-standings)
cd "$(dirname "$0")/../.."

echo "🔨 Building Docker image for AMD64 (AWS Fargate compatible)..."
docker build --platform linux/amd64 -f infra/fargate/polling-service/Dockerfile -t ${ECR_REPO_NAME}:latest .

echo "🔐 Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URI}

echo "🏷️ Tagging image for ECR..."
docker tag ${ECR_REPO_NAME}:latest ${ECR_URI}:latest

echo "⬆️ Pushing image to ECR..."
docker push ${ECR_URI}:latest

echo "✅ Successfully pushed ${ECR_REPO_NAME} to ECR!"
echo "📝 Image URI: ${ECR_URI}:latest"
echo ""
echo "🎯 You can now test the polling toggle in your UI!"