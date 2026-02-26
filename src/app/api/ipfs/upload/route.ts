import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload to Pinata
    const pinataFormData = new FormData();
    pinataFormData.append('file', file);
    pinataFormData.append('pinataMetadata', JSON.stringify({ name: file.name }));

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PINATA_JWT}`,
      },
      body: pinataFormData,
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Pinata error: ${error}` }, { status: 500 });
    }

    const data = await response.json();
    const url = `ipfs://${data.IpfsHash}`;
    
    return NextResponse.json({ url, hash: data.IpfsHash });
  } catch (error: any) {
    console.error('IPFS upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
