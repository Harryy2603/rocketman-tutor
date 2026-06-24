// src/app/api/chat/route.ts
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { createClient } from '@/lib/supabase/server';
import { buildTutorSystemPrompt } from '@/lib/ai/prompts';
import { extractAndSaveMemories } from '@/services/memory-service';

export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { messages, conversationId } = await req.json();

  // 1. Strict Authentication (Dev bypass removed)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  // 2. Fetch Learner's Long-Term Memory
  const { data: memories } = await supabase
    .from('concept_memories')
    .select('*')
    .eq('user_id', user.id);

  // 3. Construct System Prompt
  const systemPrompt = buildTutorSystemPrompt(memories || []);

  // 4. Save User Message to DB (With error logging)
  const lastUserMessage = messages[messages.length - 1];
  const { error: userMsgError } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: lastUserMessage.content
  });
  
  if (userMsgError) {
    console.error('\n[DB Error - User Message]:', userMsgError.message);
  }

  // 5. Stream AI Response
  const result = await streamText({
    model: google('gemini-2.5-flash'),
    system: systemPrompt,
    messages,
    onFinish: async ({ text }) => {
      // Save AI Response to DB
      const { error: aiMsgError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: text
      });
      
      if (aiMsgError) {
        console.error('\n[DB Error - AI Message]:', aiMsgError.message);
      }
      
      // Execute the background memory extraction using the real user.id
      console.log(`\n[System] Starting memory extraction for conversation: ${conversationId}`);
      try {
        await extractAndSaveMemories(conversationId, user.id);
        console.log(`[System] Memory extraction complete.`);
      } catch (error) {
        console.error(`[System] Memory extraction failed:`, error);
      }
    }
  });

  return result.toTextStreamResponse();
}