// src/app/api/chat/route.ts
import { streamText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { createClient } from '@/lib/supabase/server';
import { buildTutorSystemPrompt } from '@/lib/ai/prompts';
import { extractAndSaveMemories } from '@/services/memory-service';

export const maxDuration = 60;

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

// Hardcoded for now — single-user single-conversation demo
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000000';

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[Auth] No user found — returning 401');
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  console.log('[Chat] body keys:', Object.keys(body));

  const { messages } = body;
  const conversationId: string = body.conversationId ?? CONVERSATION_ID;
  console.log('[Chat] conversationId resolved to:', conversationId);
  console.log('[Chat] incoming messages:', messages?.length);

  const normalizedMessages = messages.map((msg: any) => {
    let text = msg.content;
    if (msg.parts && Array.isArray(msg.parts)) {
      text = msg.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');
    }
    return { role: msg.role, content: text || '' };
  });

  // Save user message
  const lastUserMessage = normalizedMessages[normalizedMessages.length - 1];
  const { error: userMsgError, data: userMsgData } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: lastUserMessage.content,
    })
    .select()
    .single();

  if (userMsgError) {
    console.error('[DB Error - User insert]:', userMsgError.message, userMsgError.details);
  } else {
    console.log('[DB] User message saved, id:', userMsgData?.id, 'conv:', conversationId);
  }

  // Fetch memories + system prompt
  const { data: memories } = await supabase
    .from('concept_memories')
    .select('*')
    .eq('user_id', user.id);

  const systemPrompt = buildTutorSystemPrompt(memories || []);

  const result = streamText({
    model: groq('gemma2-9b-it'),
    system: systemPrompt,
    messages: normalizedMessages,
    onFinish: async ({ text }) => {
      console.log('[onFinish] AI response length:', text.length, 'conv:', conversationId);

      const { error: aiMsgError, data: aiMsgData } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: text,
        })
        .select()
        .single();

      if (aiMsgError) {
        console.error('[DB Error - AI insert]:', aiMsgError.message, aiMsgError.details);
      } else {
        console.log('[DB] AI message saved, id:', aiMsgData?.id);
      }

      try {
        await extractAndSaveMemories(conversationId, user.id);
      } catch (error) {
        console.error('[System] Memory extraction failed:', error);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}