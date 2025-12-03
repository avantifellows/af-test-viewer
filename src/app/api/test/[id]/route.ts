import { NextRequest, NextResponse } from "next/server";

const CMS_API_ENDPOINT = "https://cms.peerlearning.com";
const CMS_AUTH_TOKEN = process.env.CMS_AUTH_TOKEN;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = `${CMS_API_ENDPOINT}/tests/${id}.json`;
    console.log("Fetching test from CMS:", url);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CMS_AUTH_TOKEN}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Test not found" }, { status: 404 });
      }
      throw new Error(`CMS returned ${response.status}`);
    }

    const testData = await response.json();
    return NextResponse.json(testData);
  } catch (error) {
    console.error("Error fetching test:", error);
    return NextResponse.json(
      { error: "Failed to fetch test from CMS" },
      { status: 500 }
    );
  }
}
