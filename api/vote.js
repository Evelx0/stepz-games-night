import { kv } from '@vercel/kv';

// --- NEW HELPER FUNCTION TO PARSE REQUEST BODY ---
async function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString(); // convert Buffer to string
    });
    req.on('end', () => {
      try {
        if (body === '') {
          resolve({}); // Resolve with empty object if body is empty
          return;
        }
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', (error) => {
      reject(error);
    });
  });
}
// --- END HELPER FUNCTION ---


export default async function handler(request) {
  // Use a try...catch block for error handling
  try {
    // --- PART 1: Handle GET request (Fetch current votes) ---
    if (request.method === 'GET') {
      
      // Fixed line for URL parsing
      const { searchParams } = new URL(request.url, `https://${request.headers.host}`);

      const pollId = searchParams.get('pollId');

      if (!pollId) {
        return new Response(JSON.stringify({ error: 'pollId is required' }), { status: 400 });
      }

      // Get all fields ("ban" and "keep") from the hash
      const votes = await kv.hgetall(pollId);
      
      const ban = votes?.ban || 0;
      const keep = votes?.keep || 0;

      return new Response(JSON.stringify({ ban, keep }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- PART 2: Handle POST request (Submit a new vote) ---
    if (request.method === 'POST') {
      
      // === THIS IS THE FIXED LINE ===
      // We now use our new helper function instead of request.json()
      const { pollId, voteType } = await parseJSONBody(request);
      // ============================

      if (!pollId || !voteType) {
        return new Response(JSON.stringify({ error: 'pollId and voteType are required' }), { status: 400 });
      }

      if (voteType !== 'ban' && voteType !== 'keep') {
        return new Response(JSON.stringify({ error: 'Invalid voteType' }), { status: 400 });
      }

      // Atomically increment the vote count for the specific pollId
      // hincrby(key, field, increment)
      await kv.hincrby(pollId, voteType, 1);

      // Get the new totals and return them
      const newVotes = await kv.hgetall(pollId);
      const ban = newVotes?.ban || 0;
      const keep = newVotes?.keep || 0;

      return new Response(JSON.stringify({ ban, keep }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- PART 3: Handle other methods ---
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
