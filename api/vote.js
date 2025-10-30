import { createClient } from '@vercel/kv';

// We create the client manually using your environment variables
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// --- HELPER FUNCTION TO PARSE REQUEST BODY ---
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
      
      console.log('--- GET REQUEST (START) ---');
      const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
      const pollId = searchParams.get('pollId');
      console.log('Parsed pollId:', pollId);

      if (!pollId) {
        console.error('CRITICAL: pollId not found in query.');
        return new Response(JSON.stringify({ error: 'pollId is required' }), { status: 400 });
      }

      console.log('Attempting to fetch votes from KV for pollId:', pollId);
      
      // === FIX: Safely handle the response from hmget ===
      let ban = 0;
      let keep = 0;
      const votesResult = await kv.hmget(pollId, 'ban', 'keep');
      console.log('Successfully fetched votes result:', votesResult);

      // Check if the result is an array before destructuring
      if (Array.isArray(votesResult)) {
        ban = votesResult[0] || 0;
        keep = votesResult[1] || 0;
      } else {
        console.warn('kv.hmget did not return an array. Defaulting votes to 0.');
      }
      // ===========
      
      console.log('Returning vote counts:', { ban, keep });
      console.log('--- GET REQUEST (SUCCESS) ---');
      return new Response(JSON.stringify({ ban, keep }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- PART 2: Handle POST request (Submit a new vote) ---
    if (request.method === 'POST') {
      console.log('--- POST REQUEST (START) ---');
      const { pollId, voteType } = await parseJSONBody(request);
      console.log('Parsed body:', { pollId, voteType });

      if (!pollId || !voteType) {
        return new Response(JSON.stringify({ error: 'pollId and voteType are required' }), { status: 400 });
      }

      if (voteType !== 'ban' && voteType !== 'keep') {
        return new Response(JSON.stringify({ error: 'Invalid voteType' }), { status: 400 });
      }

      console.log(`Incrementing ${voteType} for ${pollId}...`);
      await kv.hincrby(pollId, voteType, 1);
      console.log('Increment successful. Fetching new totals...');

      // === FIX: Safely handle the response from hmget ===
      let ban = 0;
      let keep = 0;
      const newVotesResult = await kv.hmget(pollId, 'ban', 'keep');
      console.log('Successfully fetched new totals result:', newVotesResult);
      
      // Check if the result is an array before destructuring
      if (Array.isArray(newVotesResult)) {
        ban = newVotesResult[0] || 0;
        keep = newVotesResult[1] || 0;
      } else {
        console.warn('kv.hmget did not return an array. Defaulting votes to 0.');
      }
      // ===========
      
      console.log('Returning new counts:', { ban, keep });
      console.log('--- POST REQUEST (SUCCESS) ---');
      return new Response(JSON.stringify({ ban, keep }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- PART 3: Handle other methods ---
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

  } catch (error) {
    console.error('--- UNHANDLED ERROR ---');
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
