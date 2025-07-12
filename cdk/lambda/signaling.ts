import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const tableName = process.env.ROOMS_TABLE!;

interface SignalingMessage {
  type: 'join-room' | 'leave-room' | 'signal' | 'user-list';
  roomId?: string;
  userId?: string;
  signal?: any;
  targetUserId?: string;
}

interface RoomConnection {
  roomId: string;
  connectionId: string;
  userId: string;
  ttl: number;
}

export const handler = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const { requestContext, body } = event;
  const { routeKey, connectionId, domainName, stage } = requestContext;
  
  const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    switch (routeKey) {
      case '$connect':
        return await handleConnect(connectionId);
      
      case '$disconnect':
        return await handleDisconnect(connectionId);
      
      case 'signal':
        if (!body) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Missing message body' }) };
        }
        const message: SignalingMessage = JSON.parse(body);
        return await handleSignal(connectionId, message, apiGatewayManagementApi);
      
      default:
        return { statusCode: 400, body: JSON.stringify({ error: 'Unknown route' }) };
    }
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

async function handleConnect(connectionId: string): Promise<APIGatewayProxyResultV2> {
  console.log(`Connection ${connectionId} established`);
  return { statusCode: 200 };
}

async function handleDisconnect(connectionId: string): Promise<APIGatewayProxyResultV2> {
  console.log(`Connection ${connectionId} disconnected`);
  
  try {
    // Find and remove the connection from all rooms
    const queryParams = {
      TableName: tableName,
      IndexName: 'connectionId-index',
      KeyConditionExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: {
        ':connectionId': connectionId,
      },
    };
    
    const result = await docClient.send(new QueryCommand(queryParams));
    
    if (result.Items && result.Items.length > 0) {
      for (const item of result.Items) {
        await docClient.send(new DeleteCommand({
          TableName: tableName,
          Key: {
            roomId: item.roomId,
            connectionId: connectionId,
          },
        }));
        console.log(`Removed connection ${connectionId} from room ${item.roomId}`);
      }
    }
  } catch (error) {
    console.error('Error handling disconnect:', error);
  }
  
  return { statusCode: 200 };
}

async function handleSignal(
  connectionId: string,
  message: SignalingMessage,
  apiGatewayManagementApi: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  
  switch (message.type) {
    case 'join-room':
      return await handleJoinRoom(connectionId, message, apiGatewayManagementApi);
    
    case 'leave-room':
      return await handleLeaveRoom(connectionId, message, apiGatewayManagementApi);
    
    case 'signal':
      return await handleWebRTCSignal(connectionId, message, apiGatewayManagementApi);
    
    default:
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown message type' }) };
  }
}

async function handleJoinRoom(
  connectionId: string,
  message: SignalingMessage,
  apiGatewayManagementApi: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  
  if (!message.roomId || !message.userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing roomId or userId' }) };
  }

  // Check current room size (limit to 8 users as per risk mitigation)
  const roomUsers = await getRoomUsers(message.roomId);
  if (roomUsers.length >= 8) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ 
        error: 'Room is full',
        message: 'Maximum 8 users allowed per room for optimal performance'
      }) 
    };
  }

  // Add user to room
  const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours TTL
  const roomConnection: RoomConnection = {
    roomId: message.roomId,
    connectionId,
    userId: message.userId,
    ttl,
  };

  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: roomConnection,
  }));

  // Notify all users in the room about the new user
  const updatedUsers = await getRoomUsers(message.roomId);
  await broadcastToRoom(message.roomId, {
    type: 'user-list',
    users: updatedUsers.map(user => ({ userId: user.userId, connectionId: user.connectionId })),
  }, apiGatewayManagementApi);

  console.log(`User ${message.userId} joined room ${message.roomId}`);
  return { statusCode: 200, body: JSON.stringify({ message: 'Joined room successfully' }) };
}

async function handleLeaveRoom(
  connectionId: string,
  message: SignalingMessage,
  apiGatewayManagementApi: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  
  if (!message.roomId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing roomId' }) };
  }

  // Remove user from room
  await docClient.send(new DeleteCommand({
    TableName: tableName,
    Key: {
      roomId: message.roomId,
      connectionId,
    },
  }));

  // Notify remaining users in the room
  const remainingUsers = await getRoomUsers(message.roomId);
  await broadcastToRoom(message.roomId, {
    type: 'user-list',
    users: remainingUsers.map(user => ({ userId: user.userId, connectionId: user.connectionId })),
  }, apiGatewayManagementApi, [connectionId]); // Exclude the leaving user

  console.log(`Connection ${connectionId} left room ${message.roomId}`);
  return { statusCode: 200, body: JSON.stringify({ message: 'Left room successfully' }) };
}

async function handleWebRTCSignal(
  connectionId: string,
  message: SignalingMessage,
  apiGatewayManagementApi: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  
  if (!message.targetUserId || !message.signal) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing targetUserId or signal data' }) };
  }

  // Find the target user's connection
  const targetConnections = await docClient.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': message.targetUserId,
    },
  }));

  if (!targetConnections.Items || targetConnections.Items.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Target user not found' }) };
  }

  // Forward the signal to the target user
  const targetConnectionId = targetConnections.Items[0].connectionId;
  
  try {
    await apiGatewayManagementApi.send(new PostToConnectionCommand({
      ConnectionId: targetConnectionId,
      Data: JSON.stringify({
        type: 'signal',
        fromUserId: message.userId,
        signal: message.signal,
      }),
    }));
    
    console.log(`Forwarded signal from ${connectionId} to ${targetConnectionId}`);
    return { statusCode: 200, body: JSON.stringify({ message: 'Signal forwarded' }) };
  } catch (error) {
    console.error('Error forwarding signal:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to forward signal' }) };
  }
}

async function getRoomUsers(roomId: string): Promise<RoomConnection[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'roomId = :roomId',
    ExpressionAttributeValues: {
      ':roomId': roomId,
    },
  }));

  return (result.Items || []) as RoomConnection[];
}

async function broadcastToRoom(
  roomId: string,
  message: any,
  apiGatewayManagementApi: ApiGatewayManagementApiClient,
  excludeConnections: string[] = []
): Promise<void> {
  const users = await getRoomUsers(roomId);
  const messageData = JSON.stringify(message);

  const promises = users
    .filter(user => !excludeConnections.includes(user.connectionId))
    .map(async (user) => {
      try {
        await apiGatewayManagementApi.send(new PostToConnectionCommand({
          ConnectionId: user.connectionId,
          Data: messageData,
        }));
      } catch (error) {
        console.error(`Failed to send message to ${user.connectionId}:`, error);
        // If connection is stale, remove it from the room
        if ((error as any).statusCode === 410) {
          await docClient.send(new DeleteCommand({
            TableName: tableName,
            Key: {
              roomId,
              connectionId: user.connectionId,
            },
          }));
        }
      }
    });

  await Promise.all(promises);
}