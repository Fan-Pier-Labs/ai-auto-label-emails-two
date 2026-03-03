import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import Stripe from 'stripe';

// Lazy initialization to avoid issues during build time
function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(secretKey);
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const setupEmail = cookieStore.get('setup_email')?.value;

    if (!setupEmail) {
      return NextResponse.json(
        { error: 'No setup email found. Please complete Gmail sign-in first.' },
        { status: 401 }
      );
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      console.error('STRIPE_PRICE_ID is not configured');
      return NextResponse.json(
        { error: 'Payment configuration error' },
        { status: 500 }
      );
    }

    const stripe = getStripe();

    // Get the base URL for redirects (use NEXT_APP_URL in production)
    const baseUrl = process.env.NEXT_APP_URL
      ? process.env.NEXT_APP_URL.replace(/\/$/, '')
      : request.nextUrl.origin;

    // Create a Stripe checkout session with customer_email prefilled
    // When customer_email is provided, the email field is non-editable in checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: setupEmail.toLowerCase(),
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/setup`,
    });

    if (!session.url) {
      console.error('Stripe session created without URL');
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error('Error creating checkout session:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create checkout session: ${message}` },
      { status: 500 }
    );
  }
}
