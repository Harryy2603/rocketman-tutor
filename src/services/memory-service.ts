// src/services/memory-service.ts
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { createAdminClient } from '@/lib/supabase/server';
import { memoryExtractionSchema } from '@/lib/ai/extraction-schema';

export async function extractAndSaveMemories(conversationId: string, userId: string) {
  const supabase = createAdminClient();

  // 1. Fetch the full conversation transcript
  const { data: messages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (!messages || messages.length === 0) return;

  const transcript = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

  // 2. Ask Gemini to extract structured memories
  const { object } = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: memoryExtractionSchema,
    prompt: `Analyze this tutoring transcript and extract learning concepts.
    Transcript:
    ${transcript}`
  });

  // 3. Process and Save to Database
  for (const concept of object.concepts) {
    // UPSERT the current state
    const { data: memoryRecord } = await supabase
      .from('concept_memories')
      .upsert({
        user_id: userId,
        concept_name: concept.concept_name,
        mastery_score: concept.mastery_score,
        status: concept.status,
        evidence: concept.evidence,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, concept_name' })
      .select()
      .single();

    // INSERT the timeline event
    if (memoryRecord) {
      await supabase.from('memory_events').insert({
        memory_id: memoryRecord.id,
        conversation_id: conversationId,
        score_delta: concept.score_delta,
        reasoning: concept.evidence
      });
    }
  }
}