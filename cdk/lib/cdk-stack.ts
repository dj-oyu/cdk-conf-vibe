import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table for rooms with TTL
    const roomsTable = new dynamodb.Table(this, 'RoomsTable', {
      tableName: 'whiteboard-rooms',
      partitionKey: {
        name: 'roomId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Global Secondary Index for querying by connection ID
    roomsTable.addGlobalSecondaryIndex({
      indexName: 'connectionId-index',
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // S3 bucket for static hosting
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `whiteboard-app-${this.account}-${this.region}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Origin Access Control for CloudFront
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'OAC for whiteboard app',
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
          originAccessControl,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // Lambda function for signaling
    const signalingFunction = new lambda.Function(this, 'SignalingFunction', {
      functionName: 'whiteboard-signaling',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'signaling.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        ROOMS_TABLE: roomsTable.tableName,
        REGION: this.region,
      },
    });

    // Grant DynamoDB permissions to Lambda
    roomsTable.grantReadWriteData(signalingFunction);

    // WebSocket API Gateway
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'whiteboard-signaling-api',
      description: 'WebSocket API for P2P signaling',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', signalingFunction),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', signalingFunction),
      },
    });

    // Add custom route for signaling
    webSocketApi.addRoute('signal', {
      integration: new WebSocketLambdaIntegration('SignalIntegration', signalingFunction),
    });

    // WebSocket stage
    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant API Gateway permission to invoke Lambda
    signalingFunction.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*/*`,
    });

    // Deploy frontend files to S3 with config injection
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset('../frontend'),
        s3deploy.Source.jsonData('config.js', {
          'config.js': `window.WEBSOCKET_URL = '${webSocketStage.url}';`
        })
      ],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketApiUrl', {
      value: webSocketStage.url,
      description: 'WebSocket API URL for signaling',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 bucket name for website hosting',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: roomsTable.tableName,
      description: 'DynamoDB table name for rooms',
    });
  }
}
