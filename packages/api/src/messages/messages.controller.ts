import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  GetMessagesQuerySchema,
  MarkReadRequestSchema,
  SendDirectMessageRequestSchema,
  SendMessageRequestSchema,
  TypingRequestSchema,
  type GetConversationResponse,
  type GetMessagesQuery,
  type ListConversationsResponse,
  type MarkReadRequest,
  type MarkReadResponse,
  type GetMessagesResponse,
  type SendDirectMessageRequest,
  type SendDirectMessageResponse,
  type SendMessageRequest,
  type SendMessageResponse,
  type TypingRequest,
} from '@chat/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { SendThrottlerGuard, TypingThrottlerGuard } from '../throttling/app-throttler.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Auth, AuthGuard, type AuthContext } from '../auth/auth.guard.js';
import { MessagesService } from './messages.service.js';

const ConversationIdPipe = new ZodValidationPipe(z.uuid());

/** `201` for a new Message, `200` when the client message ID had been sent before. */
const statusFor = (created: boolean) => (created ? 201 : 200);

@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** Send to a User by ID; the first Message creates the Direct Conversation. */
  @Post('direct-messages')
  @UseGuards(AuthGuard, SendThrottlerGuard)
  async sendDirect(
    @Auth() auth: AuthContext,
    @Body(new ZodValidationPipe(SendDirectMessageRequestSchema)) body: SendDirectMessageRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SendDirectMessageResponse> {
    const { message, conversation, created } = await this.messages.sendDirect(auth.userId, body);
    void reply.status(statusFor(created));
    return { message, conversation };
  }

  @Post('conversations/:id/messages')
  @UseGuards(AuthGuard, SendThrottlerGuard)
  async send(
    @Auth() auth: AuthContext,
    @Param('id', ConversationIdPipe) conversationId: string,
    @Body(new ZodValidationPipe(SendMessageRequestSchema)) body: SendMessageRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SendMessageResponse> {
    const { message, created } = await this.messages.send(auth.userId, conversationId, body);
    void reply.status(statusFor(created));
    return { message };
  }

  @Get('conversations')
  @UseGuards(AuthGuard)
  list(@Auth() auth: AuthContext): Promise<ListConversationsResponse> {
    return this.messages.list(auth.userId);
  }

  @Get('conversations/:id')
  @UseGuards(AuthGuard)
  get(
    @Auth() auth: AuthContext,
    @Param('id', ConversationIdPipe) conversationId: string,
  ): Promise<GetConversationResponse> {
    return this.messages.get(auth.userId, conversationId);
  }

  @Get('conversations/:id/messages')
  @UseGuards(AuthGuard)
  history(
    @Auth() auth: AuthContext,
    @Param('id', ConversationIdPipe) conversationId: string,
    @Query(new ZodValidationPipe(GetMessagesQuerySchema)) query: GetMessagesQuery,
  ): Promise<GetMessagesResponse> {
    return this.messages.history(auth.userId, conversationId, query);
  }

  /** Forward-only and idempotent: returns the caller's Read Marker after the request. */
  @Put('conversations/:id/read')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  markRead(
    @Auth() auth: AuthContext,
    @Param('id', ConversationIdPipe) conversationId: string,
    @Body(new ZodValidationPipe(MarkReadRequestSchema)) body: MarkReadRequest,
  ): Promise<MarkReadResponse> {
    return this.messages.markRead(auth.userId, conversationId, body.upToSequence);
  }

  /** Ephemeral (ADR-0009): relayed to the other Members, never stored. */
  @Post('conversations/:id/typing')
  @HttpCode(204)
  @UseGuards(AuthGuard, TypingThrottlerGuard)
  async typing(
    @Auth() auth: AuthContext,
    @Param('id', ConversationIdPipe) conversationId: string,
    @Body(new ZodValidationPipe(TypingRequestSchema)) body: TypingRequest,
  ): Promise<void> {
    await this.messages.signalTyping(auth.userId, conversationId, body.state);
  }
}
