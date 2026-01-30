import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { retrieveForWebhook } from '@/lib/token-store';
import { encryptForStripe } from '@/lib/encryption';

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
    // Handle the event: subscription created → attach pending token + sheet ID to customer
    if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object as Stripe.Subscription;

      // Subscription has customer ID; get customer to read email (subscription object has no email field)
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;

      if (!customerId) {
        console.error('No customer ID on subscription');
        return NextResponse.json(
          { error: 'No customer on subscription' },
          { status: 400 }
        );
      }

      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        console.error('Customer is deleted');
        return NextResponse.json(
          { error: 'Customer deleted' },
          { status: 400 }
        );
      }

      const rawEmail = (customer as Stripe.Customer).email;
      if (!rawEmail?.trim()) {
        console.error('No customer email found');
        return NextResponse.json(
          { error: 'No customer email found' },
          { status: 400 }
        );
      }
      const customerEmail = rawEmail.trim().toLowerCase();

      const pending = retrieveForWebhook(customerEmail);
      const refreshToken = pending?.refreshToken ?? null;
      const sheetId = pending?.sheetId ?? null;

      if (!refreshToken) {
        console.error(`No refresh token found for email: ${customerEmail}`);
        return NextResponse.json({ received: true, warning: 'No refresh token found' });
      }

      const existingMetadata: Record<string, string> =
        customer.metadata && typeof customer.metadata === 'object'
          ? { ...customer.metadata }
          : {};
      
      // Encrypt sensitive metadata before storing in Stripe
      const metadata: Record<string, string> = {
        ...existingMetadata,
        gmail_refresh_token: encryptForStripe(refreshToken),
        gmail_email: encryptForStripe(customerEmail),
        google_sheet_id: sheetId ? encryptForStripe(sheetId) : '',
        updated_at: new Date().toISOString(),
      };
      await stripe.customers.update(customerId, { metadata });

      console.log(
        `✅ Updated Stripe customer ${customerId} with encrypted metadata for ${customerEmail}` +
          (sheetId ? ' (includes google_sheet_id)' : '')
      );

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
