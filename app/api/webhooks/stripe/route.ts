import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { retrieveRefreshToken } from '@/lib/token-store';

// Lazy initialization to avoid issues during build time
function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      console.error('Missing Stripe signature or webhook secret');
      return NextResponse.json(
        { error: 'Missing signature or webhook secret' },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Get customer email
      const customerEmail = session.customer_email || 
        (typeof session.customer === 'string' 
          ? null 
          : (session.customer && 'email' in session.customer ? session.customer.email : null)) ||
        session.customer_details?.email;

      if (!customerEmail) {
        console.error('No customer email found in checkout session');
        return NextResponse.json(
          { error: 'No customer email found' },
          { status: 400 }
        );
      }

      // Retrieve refresh token from store
      const refreshToken = retrieveRefreshToken(customerEmail);

      if (!refreshToken) {
        console.error(`No refresh token found for email: ${customerEmail}`);
        // Don't fail the webhook - just log the error
        // The token might have expired or the email doesn't match
        return NextResponse.json({ received: true, warning: 'No refresh token found' });
      }

      // Get or create customer
      let customerId: string;
      if (typeof session.customer === 'string') {
        customerId = session.customer;
      } else if (session.customer) {
        customerId = session.customer.id;
      } else if (session.customer_details?.email) {
        // Try to find existing customer by email
        const customers = await stripe.customers.list({
          email: customerEmail,
          limit: 1,
        });
        
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
        } else {
          // Create new customer
          const customer = await stripe.customers.create({
            email: customerEmail,
          });
          customerId = customer.id;
        }
      } else {
        console.error('No customer information found in checkout session');
        return NextResponse.json(
          { error: 'No customer information found' },
          { status: 400 }
        );
      }

      // Update customer metadata with refresh token
      await stripe.customers.update(customerId, {
        metadata: {
          gmail_refresh_token: refreshToken,
          gmail_email: customerEmail,
          updated_at: new Date().toISOString(),
        },
      });

      console.log(`✅ Updated Stripe customer ${customerId} with refresh token for ${customerEmail}`);

      return NextResponse.json({ received: true, customerId });
    }

    // Return a response to acknowledge receipt of the event
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
