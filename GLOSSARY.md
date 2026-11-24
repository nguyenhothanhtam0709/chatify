---
kind: intent
---

# Chat

A chat application where users exchange text messages, either one-to-one or within groups.

## Identity

**User**:
A registered person who can sign in and take part in Conversations.
_Avoid_: Account, member (when meaning a user in general), profile

**Username**:
A User's unique, public handle used to identify them to other Users.
_Avoid_: Handle, login

**Nickname**:
An optional, non-unique display name a User may set in addition to their Username.
_Avoid_: Display name, alias

## Conversations

**Conversation**:
A container of Messages exchanged among a fixed or changing set of Users; either a Direct Conversation or a Group.
_Avoid_: Chat, thread, room, channel

**Direct Conversation**:
A Conversation between exactly two distinct Users; at most one exists for any pair.
_Avoid_: DM thread, private chat

**Group**:
A named Conversation whose set of Members can change over time.
_Avoid_: Room, channel, group chat

**Closed Group**:
A Group that has no Members left; it can never receive new Messages or Members, and Former Members can still read their part of its history.
_Avoid_: Archived group, deleted group

**Member**:
A User who currently belongs to a Conversation and may send Messages to it.
_Avoid_: Participant, subscriber

**Owner**:
The single Member of a Group who may add and remove other Members.
_Avoid_: Admin, creator, moderator

**Former Member**:
A User who left or was removed from a Group and can still read the Messages sent while they were a Member.
_Avoid_: Ex-member, removed user

**Preview**:
The text the Conversation list shows for a Conversation's last Message: the body with leading and trailing whitespace removed and each run of whitespace collapsed to one space, cut to the first 100 characters. Whitespace means what the "not blank" check on a Message body counts as whitespace. A System Message never becomes the Preview.
_Avoid_: Snippet, excerpt, summary

## Messaging

**Message**:
An immutable piece of plain text sent by a Member to exactly one Conversation.
_Avoid_: Post, chat

**System Message**:
A Message the system stores to record a membership change in a Group ("Bob was added", "Bob was removed", "Bob left", and "Bob is now the Owner" when the Owner leaves and ownership passes to Bob); it has a kind and a subject User, and takes a place in the sequence like any Message.
_Avoid_: Notification, event, note (as a stored thing)

## Reading and live signals

**Read Marker**:
The position in a Conversation up to which a Member has read, kept per Member and only ever moving forward; a new Member starts with nothing before their joining unread, and sending a Message moves the sender's own marker past it.
_Avoid_: Last seen, read cursor, read timestamp

**Unread Count**:
The number of Messages from other Members that sit after a Member's Read Marker; System Messages and a Member's own Messages never count, and a Former Member or anyone reading a Closed Group has none.
_Avoid_: Badge, notification count

**Read Receipt**:
The sign shown to a User in a Direct Conversation that the other User has read up to a given Message of theirs; shown only when both Users share receipts, and not available in Groups.
_Avoid_: Seen status, read status

**Typing Indicator**:
A short-lived sign that another Member is currently writing a Message in a Conversation; it is never stored and fades by itself unless refreshed or replaced by the Message.
_Avoid_: Typing status, composing
