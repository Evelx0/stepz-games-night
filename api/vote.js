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

  // === NEW: Handle OPTIONS preflight requests ===
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*', // Or 'https://stepz-games.vercel.app'
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  // =============================================

  // Use a try...catch block for error handling
  try {
    // --- PART 1: Handle GET request (Fetch current votes) ---
    if (request.method === 'GET') {
      
      const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
      const pollId = searchParams.get('pollId');

      if (!pollId) {
        return new Response(JSON.stringify({ error: 'pollId is required' }), { status: 400 });
      }
      
      let ban = 0;
      let keep = 0;
      const votesResult = await kv.hmget(pollId, 'ban', 'keep');

      if (Array.isArray(votesResult)) {
        ban = votesResult[0] || 0;
        keep = votesResult[1] || 0;
      } 
      else if (votesResult && typeof votesResult === 'object') {
        ban = votesResult.ban || 0;
        keep = votesResult.keep || 0;
      }
      
      return new Response(JSON.stringify({ ban, keep }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*', // === RE-ADDED CORS HEADER ===
        },
      });
    }

    // --- PART 2: Handle POST request (Submit a new vote) ---
    if (request.method === 'POST') {
      
      const { pollId, voteType } = await parseJSONBody(request);

      if (!pollId || !voteType) {
        return new Response(JSON.stringify({ error: 'pollId and voteType are required' }), { status: 400 });
      }

      if (voteType !== 'ban' && voteType !== 'keep') {
        return new Response(JSON.stringify({ error: 'Invalid voteType' }), { status: 400 });
      }

      await kv.hincrby(pollId, voteType, 1);

      let ban = 0;
      let keep = 0;
      const newVotesResult = await kv.hmget(pollId, 'ban', 'keep');
      
      if (Array.isArray(newVotesResult)) {
        ban = newVotesResult[0] || 0;
        keep = newVotesResult[1] || 0;
      } 
      else if (newVotesResult && typeof newVotesResult === 'object') {
        ban = newVotesResult.ban || 0;
        keep = newVotesResult.keep || 0;
      }
      
      return new Response(JSON.stringify({ ban, keep }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*', // === RE-ADDED CORS HEADER ===
        },
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
