"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfrastructureStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
class InfrastructureStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // DynamoDB Tables
        const weeklyStandingsTable = new dynamodb.Table(this, 'WeeklyStandings', {
            tableName: 'ff-weekly-standings',
            partitionKey: { name: 'season_week', type: dynamodb.AttributeType.STRING }, // e.g., "2025_1"
            sortKey: { name: 'team_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });
        const overallStandingsTable = new dynamodb.Table(this, 'OverallStandings', {
            tableName: 'ff-overall-standings',
            partitionKey: { name: 'season', type: dynamodb.AttributeType.STRING }, // "2025"
            sortKey: { name: 'team_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });
        const leagueDataTable = new dynamodb.Table(this, 'LeagueData', {
            tableName: 'ff-league-data',
            partitionKey: { name: 'data_type', type: dynamodb.AttributeType.STRING }, // 'users', 'rosters', 'league_info'
            sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });
        const pollingStateTable = new dynamodb.Table(this, 'PollingState', {
            tableName: 'ff-polling-state',
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }, // 'polling_status'
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });
        // VPC for Fargate services
        const vpc = new ec2.Vpc(this, 'FFVpc', {
            maxAzs: 2,
            natGateways: 0, // Use public subnets only to save costs
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'public',
                    subnetType: ec2.SubnetType.PUBLIC,
                }
            ]
        });
        // ECS Cluster
        const cluster = new ecs.Cluster(this, 'FFCluster', {
            clusterName: 'ff-cluster',
            vpc: vpc,
            containerInsights: true
        });
        // Security Group for ECS tasks (allow ECR and internet access)
        const ecsTaskSecurityGroup = new ec2.SecurityGroup(this, 'EcsTaskSecurityGroup', {
            vpc: vpc,
            description: 'Security group for FF ECS tasks',
            allowAllOutbound: true // Allow all outbound traffic for ECR, API calls, etc.
        });
        // ECR Repositories for container images
        const pollingRepo = new ecr.Repository(this, 'PollingRepo', {
            repositoryName: 'ff-polling-service',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });
        // CloudWatch Log Groups
        const pollingLogGroup = new logs.LogGroup(this, 'PollingLogGroup', {
            logGroupName: '/ff/polling-service',
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        // IAM Role for Fargate tasks
        const fargateTaskRole = new iam.Role(this, 'FargateTaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            inlinePolicies: {
                DynamoDBAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:GetItem',
                                'dynamodb:PutItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:Query',
                                'dynamodb:Scan'
                            ],
                            resources: [
                                weeklyStandingsTable.tableArn,
                                overallStandingsTable.tableArn,
                                leagueDataTable.tableArn,
                                pollingStateTable.tableArn
                            ]
                        })
                    ]
                }),
                LambdaInvoke: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['lambda:InvokeFunction'],
                            resources: ['arn:aws:lambda:*:*:function:ff-calculate-standings']
                        })
                    ]
                })
            }
        });
        // ECS Task Execution Role
        const fargateExecutionRole = new iam.Role(this, 'FargateExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
            ]
        });
        // ECS Task Definitions
        const pollingTaskDefinition = new ecs.FargateTaskDefinition(this, 'PollingTaskDefinition', {
            family: 'ff-polling-service',
            cpu: 256,
            memoryLimitMiB: 512,
            taskRole: fargateTaskRole,
            executionRole: fargateExecutionRole
        });
        pollingTaskDefinition.addContainer('polling-container', {
            containerName: 'polling-service',
            image: ecs.ContainerImage.fromEcrRepository(pollingRepo, 'latest'),
            environment: {
                SLEEPER_LEAGUE_ID: '1251986365806034944',
                WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
                OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
                LEAGUE_DATA_TABLE: leagueDataTable.tableName,
                POLLING_STATE_TABLE: pollingStateTable.tableName,
            },
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'polling',
                logGroup: pollingLogGroup
            })
        });
        // Shared Lambda Layers
        const requestsLayer = new lambda.LayerVersion(this, 'RequestsLayer', {
            layerVersionName: 'ff-requests-layer',
            code: lambda.Code.fromAsset('layers/requests-layer'),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
            description: 'Requests library for all Lambda functions'
        });
        const commonUtilsLayer = new lambda.LayerVersion(this, 'CommonUtilsLayer', {
            layerVersionName: 'ff-common-utils-layer',
            code: lambda.Code.fromAsset('layers/common-utils'),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
            description: 'Common utilities (DynamoDB, auth) for all Lambda functions'
        });
        // New: Standings calculation layer providing ff_standings package
        const standingsCalculationLayer = new lambda.LayerVersion(this, 'StandingsCalculationLayer', {
            layerVersionName: 'ff-standings-calculation-layer',
            code: lambda.Code.fromAsset('.', {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_11.bundlingImage,
                    command: [
                        'bash',
                        '-c',
                        // Docker fallback will not see repo root; kept for completeness but local bundling should succeed
                        'echo "Docker bundling for ff-standings not supported (package outside infra). Use local bundling." && exit 1'
                    ],
                    local: {
                        tryBundle(outputDir) {
                            try {
                                const cp = require('child_process');
                                const path = require('path');
                                const fs = require('fs');
                                const pythonDir = path.join(outputDir, 'python');
                                if (!fs.existsSync(pythonDir)) {
                                    fs.mkdirSync(pythonDir, { recursive: true });
                                }
                                // Resolve absolute path to packages/ff-standings from compiled file location (infra/lib)
                                const packagePath = path.resolve(__dirname, '../../packages/ff-standings');
                                if (!fs.existsSync(packagePath)) {
                                    throw new Error(`ff-standings package not found at ${packagePath}`);
                                }
                                cp.execSync(`pip3 install ${packagePath} -t ${pythonDir}`, { stdio: 'inherit' });
                                return true;
                            }
                            catch (e) {
                                console.error('Local bundling failed for ff-standings:', e);
                                return false;
                            }
                        }
                    }
                }
            }),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
            description: 'Standings calculation library (ff_standings) shared across Lambdas'
        });
        // Lambda Functions
        const historicalBackfillFunction = new lambda.Function(this, 'HistoricalBackfill', {
            functionName: 'ff-historical-backfill',
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'lambda_function.lambda_handler',
            code: lambda.Code.fromAsset('lambda/historical-backfill'),
            environment: {
                SLEEPER_LEAGUE_ID: '1251986365806034944',
                WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
                OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
                LEAGUE_DATA_TABLE: leagueDataTable.tableName,
            },
            timeout: cdk.Duration.minutes(5),
            layers: [requestsLayer, commonUtilsLayer, standingsCalculationLayer]
        });
        // Monte Carlo Simulation Lambda (vectorized with NumPy)
        const monteCarloFunction = new lambda.Function(this, 'MonteCarloFunction', {
            functionName: 'ff-monte-carlo',
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'lambda_function.lambda_handler',
            code: lambda.Code.fromAsset('lambda/monte-carlo'),
            environment: {
                SLEEPER_LEAGUE_ID: '1251986365806034944',
                WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
                OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
                LEAGUE_DATA_TABLE: leagueDataTable.tableName
            },
            timeout: cdk.Duration.minutes(15),
            memorySize: 3008, // High memory for NumPy operations
            layers: [
                requestsLayer,
                commonUtilsLayer,
                // AWS managed layer for NumPy/Pandas
                lambda.LayerVersion.fromLayerVersionArn(this, 'NumpyLayer', 'arn:aws:lambda:us-west-2:336392948345:layer:AWSSDKPandas-Python311:22')
            ]
        });
        // Enhanced API Handler with ECS permissions
        const apiFunction = new lambda.Function(this, 'ApiFunction', {
            functionName: 'ff-api-handler',
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'lambda_function.lambda_handler',
            code: lambda.Code.fromAsset('lambda/api-handler'),
            environment: {
                WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
                OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
                LEAGUE_DATA_TABLE: leagueDataTable.tableName,
                POLLING_STATE_TABLE: pollingStateTable.tableName,
                ECS_CLUSTER_ARN: cluster.clusterArn,
                POLLING_TASK_DEFINITION_ARN: pollingTaskDefinition.taskDefinitionArn,
                SUBNET_IDS: vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
                SECURITY_GROUP_ID: ecsTaskSecurityGroup.securityGroupId,
                HISTORICAL_BACKFILL_FUNCTION: 'ff-historical-backfill',
                MONTE_CARLO_FUNCTION: 'ff-monte-carlo',
                ADMIN_API_KEY: this.node.tryGetContext('adminKey') || 'madtown-admin-2025-default'
            },
            timeout: cdk.Duration.seconds(180),
            memorySize: 512,
            layers: [requestsLayer, commonUtilsLayer]
        });
        // Grant DynamoDB permissions to Lambda functions
        weeklyStandingsTable.grantReadWriteData(historicalBackfillFunction);
        overallStandingsTable.grantReadWriteData(historicalBackfillFunction);
        leagueDataTable.grantReadWriteData(historicalBackfillFunction);
        weeklyStandingsTable.grantReadData(apiFunction);
        overallStandingsTable.grantReadData(apiFunction);
        leagueDataTable.grantReadData(apiFunction);
        pollingStateTable.grantReadWriteData(apiFunction);
        weeklyStandingsTable.grantReadData(monteCarloFunction);
        overallStandingsTable.grantReadWriteData(monteCarloFunction);
        leagueDataTable.grantReadData(monteCarloFunction);
        // Grant Lambda invoke permissions
        historicalBackfillFunction.grantInvoke(apiFunction);
        monteCarloFunction.grantInvoke(apiFunction);
        // Grant ECS permissions to API handler
        apiFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ecs:RunTask',
                'ecs:StopTask',
                'ecs:DescribeTasks',
                'ecs:ListTasks',
                'ecs:TagResource'
            ],
            resources: [
                pollingTaskDefinition.taskDefinitionArn,
                `${cluster.clusterArn}/*`,
                `arn:aws:ecs:${this.region}:${this.account}:task/${cluster.clusterName}/*`
            ]
        }));
        apiFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iam:PassRole'],
            resources: [
                fargateTaskRole.roleArn,
                fargateExecutionRole.roleArn
            ]
        }));
        apiFunction.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
        // API Gateway
        const api = new apigateway.RestApi(this, 'FantasyFootballApi', {
            restApiName: 'fantasy-football-vs-everyone',
            description: 'API for Fantasy Football vs Everyone app',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Admin-Key']
            }
        });
        // API Routes
        const weeklyResource = api.root.addResource('weekly');
        weeklyResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
        const overallResource = api.root.addResource('overall');
        overallResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
        const nflStateResource = api.root.addResource('nfl-state');
        nflStateResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
        const pollingResource = api.root.addResource('polling');
        const pollingStatusResource = pollingResource.addResource('status');
        pollingStatusResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
        const pollingToggleResource = pollingResource.addResource('toggle');
        pollingToggleResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));
        const calculatePlayoffsResource = api.root.addResource('calculate-playoffs');
        calculatePlayoffsResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));
        const syncHistoricalResource = api.root.addResource('sync-historical');
        syncHistoricalResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));
        const playersResource = api.root.addResource('players');
        playersResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
        const adminResource = api.root.addResource('admin');
        const adminValidateResource = adminResource.addResource('validate');
        adminValidateResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));
        // Stack Outputs
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
            description: 'Fantasy Football API URL'
        });
        new cdk.CfnOutput(this, 'PollingRepoUri', {
            value: pollingRepo.repositoryUri,
            description: 'ECR Repository URI for polling service'
        });
        new cdk.CfnOutput(this, 'ClusterArn', {
            value: cluster.clusterArn,
            description: 'ECS Cluster ARN'
        });
    }
}
exports.InfrastructureStack = InfrastructureStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFDakQsbUVBQXFEO0FBQ3JELHVFQUF5RDtBQUN6RCx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsMkRBQTZDO0FBRzdDLE1BQWEsbUJBQW9CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDaEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixrQkFBa0I7UUFDbEIsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3ZFLFNBQVMsRUFBRSxxQkFBcUI7WUFDaEMsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxpQkFBaUI7WUFDN0YsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDakUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsZUFBZTtZQUNqRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3hDLENBQUMsQ0FBQztRQUVILE1BQU0scUJBQXFCLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN6RSxTQUFTLEVBQUUsc0JBQXNCO1lBQ2pDLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVB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RyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4RCxlQUFlLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBRWhGLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BELE1BQU0scUJBQXFCLEdBQUcsYUFBYSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNwRSxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFFdkYsZ0JBQWdCO1FBQ2hCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsV0FBVyxDQUFDLGFBQWE7WUFDaEMsV0FBVyxFQUFFLHdDQUF3QztTQUN0RCxDQUFDLENBQUM7UUFHSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsT0FBTyxDQUFDLFVBQVU7WUFDekIsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0WEQsa0RBc1hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNyJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBjbGFzcyBJbmZyYXN0cnVjdHVyZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGVzXG4gICAgY29uc3Qgd2Vla2x5U3RhbmRpbmdzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1dlZWtseVN0YW5kaW5ncycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ2ZmLXdlZWtseS1zdGFuZGluZ3MnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdzZWFzb25fd2VlaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sIC8vIGUuZy4sIFwiMjAyNV8xXCJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3RlYW1faWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTlxuICAgIH0pO1xuXG4gICAgY29uc3Qgb3ZlcmFsbFN0YW5kaW5nc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdPdmVyYWxsU3RhbmRpbmdzJywge1xuICAgICAgdGFibGVOYW1lOiAnZmYtb3ZlcmFsbC1zdGFuZGluZ3MnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdzZWFzb24nLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LCAvLyBcIjIwMjVcIlxuICAgICAgc29ydEtleTogeyBuYW1lOiAndGVhbV9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOXG4gICAgfSk7XG5cbiAgICBjb25zdCBsZWFndWVEYXRhVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0xlYWd1ZURhdGEnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdmZi1sZWFndWUtZGF0YScsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2RhdGFfdHlwZScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sIC8vICd1c2VycycsICdyb3N0ZXJzJywgJ2xlYWd1ZV9pbmZvJ1xuICAgICAgc29ydEtleTogeyBuYW1lOiAnaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTlxuICAgIH0pO1xuXG4gICAgY29uc3QgcG9sbGluZ1N0YXRlVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1BvbGxpbmdTdGF0ZScsIHtcbiAgICAgIHRhYmxlTmFtZTogJ2ZmLXBvbGxpbmctc3RhdGUnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdpZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sIC8vICdwb2xsaW5nX3N0YXR1cydcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU5cbiAgICB9KTtcblxuICAgIC8vIFZQQyBmb3IgRmFyZ2F0ZSBzZXJ2aWNlc1xuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdGRlZwYycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIG5hdEdhdGV3YXlzOiAwLCAvLyBVc2UgcHVibGljIHN1Ym5ldHMgb25seSB0byBzYXZlIGNvc3RzXG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ3B1YmxpYycsXG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBFQ1MgQ2x1c3RlclxuICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWNzLkNsdXN0ZXIodGhpcywgJ0ZGQ2x1c3RlcicsIHtcbiAgICAgIGNsdXN0ZXJOYW1lOiAnZmYtY2x1c3RlcicsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBHcm91cCBmb3IgRUNTIHRhc2tzIChhbGxvdyBFQ1IgYW5kIGludGVybmV0IGFjY2VzcylcbiAgICBjb25zdCBlY3NUYXNrU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRWNzVGFza1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEZGIEVDUyB0YXNrcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlIC8vIEFsbG93IGFsbCBvdXRib3VuZCB0cmFmZmljIGZvciBFQ1IsIEFQSSBjYWxscywgZXRjLlxuICAgIH0pO1xuXG4gICAgLy8gRUNSIFJlcG9zaXRvcmllcyBmb3IgY29udGFpbmVyIGltYWdlc1xuICAgIGNvbnN0IHBvbGxpbmdSZXBvID0gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsICdQb2xsaW5nUmVwbycsIHtcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiAnZmYtcG9sbGluZy1zZXJ2aWNlJyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTlxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2cgR3JvdXBzXG4gICAgY29uc3QgcG9sbGluZ0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1BvbGxpbmdMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogJy9mZi9wb2xsaW5nLXNlcnZpY2UnLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgRmFyZ2F0ZSB0YXNrc1xuICAgIGNvbnN0IGZhcmdhdGVUYXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRmFyZ2F0ZVRhc2tSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBEeW5hbW9EQkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6RGVsZXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbidcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgd2Vla2x5U3RhbmRpbmdzVGFibGUudGFibGVBcm4sXG4gICAgICAgICAgICAgICAgb3ZlcmFsbFN0YW5kaW5nc1RhYmxlLnRhYmxlQXJuLFxuICAgICAgICAgICAgICAgIGxlYWd1ZURhdGFUYWJsZS50YWJsZUFybixcbiAgICAgICAgICAgICAgICBwb2xsaW5nU3RhdGVUYWJsZS50YWJsZUFyblxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSksXG4gICAgICAgIExhbWJkYUludm9rZTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnbGFtYmRhOkludm9rZUZ1bmN0aW9uJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWydhcm46YXdzOmxhbWJkYToqOio6ZnVuY3Rpb246ZmYtY2FsY3VsYXRlLXN0YW5kaW5ncyddXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEVDUyBUYXNrIEV4ZWN1dGlvbiBSb2xlXG4gICAgY29uc3QgZmFyZ2F0ZUV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0ZhcmdhdGVFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gRUNTIFRhc2sgRGVmaW5pdGlvbnNcbiAgICBjb25zdCBwb2xsaW5nVGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnUG9sbGluZ1Rhc2tEZWZpbml0aW9uJywge1xuICAgICAgZmFtaWx5OiAnZmYtcG9sbGluZy1zZXJ2aWNlJyxcbiAgICAgIGNwdTogMjU2LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IDUxMixcbiAgICAgIHRhc2tSb2xlOiBmYXJnYXRlVGFza1JvbGUsXG4gICAgICBleGVjdXRpb25Sb2xlOiBmYXJnYXRlRXhlY3V0aW9uUm9sZVxuICAgIH0pO1xuXG4gICAgcG9sbGluZ1Rhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcigncG9sbGluZy1jb250YWluZXInLCB7XG4gICAgICBjb250YWluZXJOYW1lOiAncG9sbGluZy1zZXJ2aWNlJyxcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbUVjclJlcG9zaXRvcnkocG9sbGluZ1JlcG8sICdsYXRlc3QnKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNMRUVQRVJfTEVBR1VFX0lEOiAnMTI1MTk4NjM2NTgwNjAzNDk0NCcsXG4gICAgICAgIFdFRUtMWV9TVEFORElOR1NfVEFCTEU6IHdlZWtseVN0YW5kaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgT1ZFUkFMTF9TVEFORElOR1NfVEFCTEU6IG92ZXJhbGxTdGFuZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIExFQUdVRV9EQVRBX1RBQkxFOiBsZWFndWVEYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQT0xMSU5HX1NUQVRFX1RBQkxFOiBwb2xsaW5nU3RhdGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ3BvbGxpbmcnLFxuICAgICAgICBsb2dHcm91cDogcG9sbGluZ0xvZ0dyb3VwXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gU2hhcmVkIExhbWJkYSBMYXllcnNcbiAgICBjb25zdCByZXF1ZXN0c0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1JlcXVlc3RzTGF5ZXInLCB7XG4gICAgICBsYXllclZlcnNpb25OYW1lOiAnZmYtcmVxdWVzdHMtbGF5ZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYXllcnMvcmVxdWVzdHMtbGF5ZXInKSxcbiAgICAgIGNvbXBhdGlibGVSdW50aW1lczogW2xhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmVxdWVzdHMgbGlicmFyeSBmb3IgYWxsIExhbWJkYSBmdW5jdGlvbnMnXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb21tb25VdGlsc0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ0NvbW1vblV0aWxzTGF5ZXInLCB7XG4gICAgICBsYXllclZlcnNpb25OYW1lOiAnZmYtY29tbW9uLXV0aWxzLWxheWVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGF5ZXJzL2NvbW1vbi11dGlscycpLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTFdLFxuICAgICAgZGVzY3JpcHRpb246ICdDb21tb24gdXRpbGl0aWVzIChEeW5hbW9EQiwgYXV0aCkgZm9yIGFsbCBMYW1iZGEgZnVuY3Rpb25zJ1xuICAgIH0pO1xuXG4gICAgLy8gTmV3OiBTdGFuZGluZ3MgY2FsY3VsYXRpb24gbGF5ZXIgcHJvdmlkaW5nIGZmX3N0YW5kaW5ncyBwYWNrYWdlXG4gICAgY29uc3Qgc3RhbmRpbmdzQ2FsY3VsYXRpb25MYXllciA9IG5ldyBsYW1iZGEuTGF5ZXJWZXJzaW9uKHRoaXMsICdTdGFuZGluZ3NDYWxjdWxhdGlvbkxheWVyJywge1xuICAgICAgbGF5ZXJWZXJzaW9uTmFtZTogJ2ZmLXN0YW5kaW5ncy1jYWxjdWxhdGlvbi1sYXllcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4nLCB7XG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgJ2Jhc2gnLFxuICAgICAgICAgICAgJy1jJyxcbiAgICAgICAgICAgIC8vIERvY2tlciBmYWxsYmFjayB3aWxsIG5vdCBzZWUgcmVwbyByb290OyBrZXB0IGZvciBjb21wbGV0ZW5lc3MgYnV0IGxvY2FsIGJ1bmRsaW5nIHNob3VsZCBzdWNjZWVkXG4gICAgICAgICAgICAnZWNobyBcIkRvY2tlciBidW5kbGluZyBmb3IgZmYtc3RhbmRpbmdzIG5vdCBzdXBwb3J0ZWQgKHBhY2thZ2Ugb3V0c2lkZSBpbmZyYSkuIFVzZSBsb2NhbCBidW5kbGluZy5cIiAmJiBleGl0IDEnXG4gICAgICAgICAgXSxcbiAgICAgICAgICBsb2NhbDoge1xuICAgICAgICAgICAgdHJ5QnVuZGxlKG91dHB1dERpcjogc3RyaW5nKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3AgPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcHl0aG9uRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ3B5dGhvbicpO1xuICAgICAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhweXRob25EaXIpKSB7XG4gICAgICAgICAgICAgICAgICBmcy5ta2RpclN5bmMocHl0aG9uRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gUmVzb2x2ZSBhYnNvbHV0ZSBwYXRoIHRvIHBhY2thZ2VzL2ZmLXN0YW5kaW5ncyBmcm9tIGNvbXBpbGVkIGZpbGUgbG9jYXRpb24gKGluZnJhL2xpYilcbiAgICAgICAgICAgICAgICBjb25zdCBwYWNrYWdlUGF0aCA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wYWNrYWdlcy9mZi1zdGFuZGluZ3MnKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMocGFja2FnZVBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGZmLXN0YW5kaW5ncyBwYWNrYWdlIG5vdCBmb3VuZCBhdCAke3BhY2thZ2VQYXRofWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjcC5leGVjU3luYyhgcGlwMyBpbnN0YWxsICR7cGFja2FnZVBhdGh9IC10ICR7cHl0aG9uRGlyfWAsIHsgc3RkaW86ICdpbmhlcml0JyB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0xvY2FsIGJ1bmRsaW5nIGZhaWxlZCBmb3IgZmYtc3RhbmRpbmdzOicsIGUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSksXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMV0sXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YW5kaW5ncyBjYWxjdWxhdGlvbiBsaWJyYXJ5IChmZl9zdGFuZGluZ3MpIHNoYXJlZCBhY3Jvc3MgTGFtYmRhcydcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBGdW5jdGlvbnNcblxuICAgIGNvbnN0IGhpc3RvcmljYWxCYWNrZmlsbEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnSGlzdG9yaWNhbEJhY2tmaWxsJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnZmYtaGlzdG9yaWNhbC1iYWNrZmlsbCcsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24ubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvaGlzdG9yaWNhbC1iYWNrZmlsbCcpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0xFRVBFUl9MRUFHVUVfSUQ6ICcxMjUxOTg2MzY1ODA2MDM0OTQ0JyxcbiAgICAgICAgV0VFS0xZX1NUQU5ESU5HU19UQUJMRTogd2Vla2x5U3RhbmRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBPVkVSQUxMX1NUQU5ESU5HU19UQUJMRTogb3ZlcmFsbFN0YW5kaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgTEVBR1VFX0RBVEFfVEFCTEU6IGxlYWd1ZURhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBsYXllcnM6IFtyZXF1ZXN0c0xheWVyLCBjb21tb25VdGlsc0xheWVyLCBzdGFuZGluZ3NDYWxjdWxhdGlvbkxheWVyXVxuICAgIH0pO1xuXG4gICAgLy8gTW9udGUgQ2FybG8gU2ltdWxhdGlvbiBMYW1iZGEgKHZlY3Rvcml6ZWQgd2l0aCBOdW1QeSlcbiAgICBjb25zdCBtb250ZUNhcmxvRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdNb250ZUNhcmxvRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdmZi1tb250ZS1jYXJsbycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24ubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvbW9udGUtY2FybG8nKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNMRUVQRVJfTEVBR1VFX0lEOiAnMTI1MTk4NjM2NTgwNjAzNDk0NCcsXG4gICAgICAgIFdFRUtMWV9TVEFORElOR1NfVEFCTEU6IHdlZWtseVN0YW5kaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgT1ZFUkFMTF9TVEFORElOR1NfVEFCTEU6IG92ZXJhbGxTdGFuZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIExFQUdVRV9EQVRBX1RBQkxFOiBsZWFndWVEYXRhVGFibGUudGFibGVOYW1lXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMzAwOCwgIC8vIEhpZ2ggbWVtb3J5IGZvciBOdW1QeSBvcGVyYXRpb25zXG4gICAgICBsYXllcnM6IFtcbiAgICAgICAgcmVxdWVzdHNMYXllcixcbiAgICAgICAgY29tbW9uVXRpbHNMYXllcixcbiAgICAgICAgLy8gQVdTIG1hbmFnZWQgbGF5ZXIgZm9yIE51bVB5L1BhbmRhc1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ051bXB5TGF5ZXInLCBcbiAgICAgICAgICAnYXJuOmF3czpsYW1iZGE6dXMtd2VzdC0yOjMzNjM5Mjk0ODM0NTpsYXllcjpBV1NTREtQYW5kYXMtUHl0aG9uMzExOjIyJ1xuICAgICAgICApXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBFbmhhbmNlZCBBUEkgSGFuZGxlciB3aXRoIEVDUyBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGFwaUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXBpRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdmZi1hcGktaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24ubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvYXBpLWhhbmRsZXInKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFdFRUtMWV9TVEFORElOR1NfVEFCTEU6IHdlZWtseVN0YW5kaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgT1ZFUkFMTF9TVEFORElOR1NfVEFCTEU6IG92ZXJhbGxTdGFuZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIExFQUdVRV9EQVRBX1RBQkxFOiBsZWFndWVEYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQT0xMSU5HX1NUQVRFX1RBQkxFOiBwb2xsaW5nU3RhdGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEVDU19DTFVTVEVSX0FSTjogY2x1c3Rlci5jbHVzdGVyQXJuLFxuICAgICAgICBQT0xMSU5HX1RBU0tfREVGSU5JVElPTl9BUk46IHBvbGxpbmdUYXNrRGVmaW5pdGlvbi50YXNrRGVmaW5pdGlvbkFybixcbiAgICAgICAgU1VCTkVUX0lEUzogdnBjLnB1YmxpY1N1Ym5ldHMubWFwKHN1Ym5ldCA9PiBzdWJuZXQuc3VibmV0SWQpLmpvaW4oJywnKSxcbiAgICAgICAgU0VDVVJJVFlfR1JPVVBfSUQ6IGVjc1Rhc2tTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCxcbiAgICAgICAgSElTVE9SSUNBTF9CQUNLRklMTF9GVU5DVElPTjogJ2ZmLWhpc3RvcmljYWwtYmFja2ZpbGwnLFxuICAgICAgICBNT05URV9DQVJMT19GVU5DVElPTjogJ2ZmLW1vbnRlLWNhcmxvJyxcbiAgICAgICAgQURNSU5fQVBJX0tFWTogdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2FkbWluS2V5JykgfHwgJ21hZHRvd24tYWRtaW4tMjAyNS1kZWZhdWx0J1xuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE4MCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsYXllcnM6IFtyZXF1ZXN0c0xheWVyLCBjb21tb25VdGlsc0xheWVyXVxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgdG8gTGFtYmRhIGZ1bmN0aW9uc1xuXG4gICAgd2Vla2x5U3RhbmRpbmdzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGhpc3RvcmljYWxCYWNrZmlsbEZ1bmN0aW9uKTtcbiAgICBvdmVyYWxsU3RhbmRpbmdzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGhpc3RvcmljYWxCYWNrZmlsbEZ1bmN0aW9uKTtcbiAgICBsZWFndWVEYXRhVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGhpc3RvcmljYWxCYWNrZmlsbEZ1bmN0aW9uKTtcblxuICAgIHdlZWtseVN0YW5kaW5nc1RhYmxlLmdyYW50UmVhZERhdGEoYXBpRnVuY3Rpb24pO1xuICAgIG92ZXJhbGxTdGFuZGluZ3NUYWJsZS5ncmFudFJlYWREYXRhKGFwaUZ1bmN0aW9uKTtcbiAgICBsZWFndWVEYXRhVGFibGUuZ3JhbnRSZWFkRGF0YShhcGlGdW5jdGlvbik7XG4gICAgcG9sbGluZ1N0YXRlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFwaUZ1bmN0aW9uKTtcblxuICAgIHdlZWtseVN0YW5kaW5nc1RhYmxlLmdyYW50UmVhZERhdGEobW9udGVDYXJsb0Z1bmN0aW9uKTtcbiAgICBvdmVyYWxsU3RhbmRpbmdzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKG1vbnRlQ2FybG9GdW5jdGlvbik7XG4gICAgbGVhZ3VlRGF0YVRhYmxlLmdyYW50UmVhZERhdGEobW9udGVDYXJsb0Z1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IExhbWJkYSBpbnZva2UgcGVybWlzc2lvbnNcbiAgICBoaXN0b3JpY2FsQmFja2ZpbGxGdW5jdGlvbi5ncmFudEludm9rZShhcGlGdW5jdGlvbik7XG4gICAgbW9udGVDYXJsb0Z1bmN0aW9uLmdyYW50SW52b2tlKGFwaUZ1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IEVDUyBwZXJtaXNzaW9ucyB0byBBUEkgaGFuZGxlclxuICAgIGFwaUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdlY3M6UnVuVGFzaycsXG4gICAgICAgICdlY3M6U3RvcFRhc2snLFxuICAgICAgICAnZWNzOkRlc2NyaWJlVGFza3MnLFxuICAgICAgICAnZWNzOkxpc3RUYXNrcycsXG4gICAgICAgICdlY3M6VGFnUmVzb3VyY2UnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIHBvbGxpbmdUYXNrRGVmaW5pdGlvbi50YXNrRGVmaW5pdGlvbkFybixcbiAgICAgICAgYCR7Y2x1c3Rlci5jbHVzdGVyQXJufS8qYCxcbiAgICAgICAgYGFybjphd3M6ZWNzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YXNrLyR7Y2x1c3Rlci5jbHVzdGVyTmFtZX0vKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICBhcGlGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydpYW06UGFzc1JvbGUnXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBmYXJnYXRlVGFza1JvbGUucm9sZUFybixcbiAgICAgICAgZmFyZ2F0ZUV4ZWN1dGlvblJvbGUucm9sZUFyblxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIGFwaUZ1bmN0aW9uLnJvbGU/LmFkZE1hbmFnZWRQb2xpY3koXG4gICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvbkR5bmFtb0RCRnVsbEFjY2VzcycpXG4gICAgKVxuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdGYW50YXN5Rm9vdGJhbGxBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ2ZhbnRhc3ktZm9vdGJhbGwtdnMtZXZlcnlvbmUnLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIEZhbnRhc3kgRm9vdGJhbGwgdnMgRXZlcnlvbmUgYXBwJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnWC1BbXotRGF0ZScsICdBdXRob3JpemF0aW9uJywgJ1gtQXBpLUtleScsICdYLUFkbWluLUtleSddXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBUEkgUm91dGVzXG4gICAgY29uc3Qgd2Vla2x5UmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnd2Vla2x5Jyk7XG4gICAgd2Vla2x5UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlGdW5jdGlvbikpO1xuXG4gICAgY29uc3Qgb3ZlcmFsbFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ292ZXJhbGwnKTtcbiAgICBvdmVyYWxsUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlGdW5jdGlvbikpO1xuXG4gICAgY29uc3QgbmZsU3RhdGVSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCduZmwtc3RhdGUnKTtcbiAgICBuZmxTdGF0ZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXBpRnVuY3Rpb24pKTtcblxuICAgIGNvbnN0IHBvbGxpbmdSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdwb2xsaW5nJyk7XG4gICAgY29uc3QgcG9sbGluZ1N0YXR1c1Jlc291cmNlID0gcG9sbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcbiAgICBwb2xsaW5nU3RhdHVzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlGdW5jdGlvbikpO1xuICAgIFxuICAgIGNvbnN0IHBvbGxpbmdUb2dnbGVSZXNvdXJjZSA9IHBvbGxpbmdSZXNvdXJjZS5hZGRSZXNvdXJjZSgndG9nZ2xlJyk7XG4gICAgcG9sbGluZ1RvZ2dsZVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwaUZ1bmN0aW9uKSk7XG5cbiAgICBjb25zdCBjYWxjdWxhdGVQbGF5b2Zmc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2NhbGN1bGF0ZS1wbGF5b2ZmcycpO1xuICAgIGNhbGN1bGF0ZVBsYXlvZmZzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXBpRnVuY3Rpb24pKTtcblxuICAgIGNvbnN0IHN5bmNIaXN0b3JpY2FsUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnc3luYy1oaXN0b3JpY2FsJyk7XG4gICAgc3luY0hpc3RvcmljYWxSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlGdW5jdGlvbikpO1xuXG4gICAgY29uc3QgcGxheWVyc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3BsYXllcnMnKTtcbiAgICBwbGF5ZXJzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlGdW5jdGlvbikpO1xuXG4gICAgY29uc3QgYWRtaW5SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhZG1pbicpO1xuICAgIGNvbnN0IGFkbWluVmFsaWRhdGVSZXNvdXJjZSA9IGFkbWluUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3ZhbGlkYXRlJyk7XG4gICAgYWRtaW5WYWxpZGF0ZVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwaUZ1bmN0aW9uKSk7XG5cbiAgICAvLyBTdGFjayBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiBhcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdGYW50YXN5IEZvb3RiYWxsIEFQSSBVUkwnXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUG9sbGluZ1JlcG9VcmknLCB7XG4gICAgICB2YWx1ZTogcG9sbGluZ1JlcG8ucmVwb3NpdG9yeVVyaSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNSIFJlcG9zaXRvcnkgVVJJIGZvciBwb2xsaW5nIHNlcnZpY2UnXG4gICAgfSk7XG5cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbHVzdGVyQXJuJywge1xuICAgICAgdmFsdWU6IGNsdXN0ZXIuY2x1c3RlckFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNTIENsdXN0ZXIgQVJOJ1xuICAgIH0pO1xuICB9XG59Il19