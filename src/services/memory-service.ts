import { createClient } from '@/lib/supabase/server';
import Groq from 'groq-sdk';
import { z } from 'zod';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ConceptSchema = z.object({
  concepts: z.array(z.object({
    concept_name: z.string(),
    status: z.enum(['weak', 'developing', 'proficient', 'mastered']),
    mastery_score: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    evidence_source: z.enum(['student', 'inferred']),
    evidence: z.array(z.string()).min(1),
  }))
});

const MIN_CONFIDENCE_FOR_INFERRED = 0.6;

function toMatchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')      
    .replace(/[^a-z0-9\s]/g, '') 
    .replace(/\s+/g, ' ')
    .trim();
}

function isSameConcept(a: string, b: string): boolean {
  const ka = toMatchKey(a);
  const kb = toMatchKey(b);
  if (ka === kb) return true;
  // One contains the other (e.g. "vm" inside "virtual machine")
  if (ka.split(' ').every(w => kb.includes(w))) return true;
  if (kb.split(' ').every(w => ka.includes(w))) return true;
  return false;
}

export async function extractAndSaveMemories(conversationId: string, userId: string) {
  console.log('\n[Memory] Starting extraction for conv:', conversationId);
  const supabase = await createClient();

  const { data: messages, error: fetchError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (fetchError) { console.error('[Memory] Failed to fetch messages:', fetchError.message); return; }
  if (!messages?.length) { console.log('[Memory] No messages found'); return; }

  console.log('[Memory] Found', messages.length, 'messages to analyze');

  const { data: existingConcepts } = await supabase
    .from('concept_memories')
    .select('id, concept_name, mastery_score, status')
    .eq('user_id', userId);

  const existingList = existingConcepts ?? [];
  const existingNamesBlock = existingList.length > 0
    ? `\nEXISTING CONCEPTS IN MEMORY (use these EXACT names if the concept matches):\n${existingList.map(c => `- "${c.concept_name}" (current: ${c.status}, ${c.mastery_score}%)`).join('\n')}\n`
    : '';

  const transcript = messages
    .map(m => `[${m.role === 'user' ? 'STUDENT' : 'TUTOR'}]: ${m.content}`)
    .join('\n\n');

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a learning analytics system that builds a student's knowledge profile from tutoring transcripts.

Your job is to assess what the STUDENT knows — NOT what the TUTOR explained.
${existingNamesBlock}
CRITICAL RULES:
1. If the concept already exists in memory (see list above), use the EXACT same concept_name string.
   Do NOT rename it, abbreviate it, or create a variant. Copy it character-for-character.

2. Only include a concept if the STUDENT gave evidence:
   - "I know X" / "I understand X now" = strong prior/learned knowledge (mastery 70-90)
   - "I'm confused about X" / asking about X = weak/gap (mastery 10-25)
   - "I somewhat understand X" / "not clearly but somewhat" = developing (mastery 30-50)
   - Student correctly explains X = proficient/mastered (mastery 60-90)
   - Tutor explained X, student gave NO response = DO NOT include, or inferred + confidence < 0.4

3. mastery_score 0-100 based on student evidence only.

4. evidence = JSON array of direct quotes from STUDENT messages only. Never from tutor.

5. evidence_source = "student" if there's a direct student quote; "inferred" if you had to infer.

Return valid JSON:
{
  "concepts": [
    {
      "concept_name": "string (exact match from existing list if applicable)",
      "status": "weak|developing|proficient|mastered",
      "mastery_score": 0-100,
      "confidence": 0.0-1.0,
      "evidence_source": "student|inferred",
      "evidence": ["quote from student"]
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Analyze this tutoring transcript. Only assess what the STUDENT demonstrated.\n\n${transcript}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    console.log('[Memory] Raw response:', raw.slice(0, 400));

    const parsed = JSON.parse(raw);
    const validated = ConceptSchema.parse(parsed);
    console.log(`[Memory] Extracted ${validated.concepts.length} concepts`);

    for (const concept of validated.concepts) {
      // Skip low-confidence inferred concepts
      if (concept.evidence_source === 'inferred' && concept.confidence < MIN_CONFIDENCE_FOR_INFERRED) {
        console.log(`[Memory] Skipped (inferred, low conf ${concept.confidence}): ${concept.concept_name}`);
        continue;
      }

      const evidenceText = concept.evidence.join(' → ');

      let existing = existingList.find(e => isSameConcept(e.concept_name, concept.concept_name)) ?? null;

      const storedName = existing
        ? existing.concept_name
        : concept.concept_name.trim().replace(/\b\w/g, c => c.toUpperCase());

      console.log(`[Memory] Concept: "${concept.concept_name}" → stored as "${storedName}" | existing: ${!!existing}`);

      if (existing) {
        // Update by ID — guaranteed to hit the right row regardless of name drift
        const scoreDelta = concept.mastery_score - existing.mastery_score;
        const { error: updateError } = await supabase
          .from('concept_memories')
          .update({
            status: concept.status,
            mastery_score: concept.mastery_score,
            evidence: evidenceText,
            confidence: concept.confidence,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error(`[Memory] Update error for "${storedName}":`, updateError.message);
          continue;
        }

        await supabase.from('memory_events').insert({
          memory_id: existing.id,
          conversation_id: conversationId,
          score_delta: scoreDelta,
          reasoning: evidenceText,
        });
        console.log(`[Memory] Updated: "${storedName}" ${existing.mastery_score} → ${concept.mastery_score} (Δ${scoreDelta > 0 ? '+' : ''}${scoreDelta})`);
      } else {
        // New concept — insert
        const { data: inserted, error: insertError } = await supabase
          .from('concept_memories')
          .insert({
            user_id: userId,
            concept_name: storedName,
            status: concept.status,
            mastery_score: concept.mastery_score,
            evidence: evidenceText,
            confidence: concept.confidence,
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[Memory] Insert error for "${storedName}":`, insertError.message);
          continue;
        }

        if (inserted) {
          await supabase.from('memory_events').insert({
            memory_id: inserted.id,
            conversation_id: conversationId,
            score_delta: concept.mastery_score,
            reasoning: 'Initial assessment.',
          });
          console.log(`[Memory] Inserted: "${storedName}" at ${concept.mastery_score}%`);
        }
      }
    }
    console.log('[Memory] Extraction complete!');
  } catch (error) {
    console.error('[Memory] Extraction failed:', error);
  }
}
