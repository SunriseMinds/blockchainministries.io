import React from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const PaypalDonate = () => {
  const { toast } = useToast();
  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || 'YOUR_PAYPAL_CLIENT_ID';

  if (paypalClientId === 'YOUR_PAYPAL_CLIENT_ID') {
    return (
      <div className="text-center p-8 bg-yellow-900/20 border border-yellow-700 rounded-lg">
        <h3 className="text-xl font-bold text-yellow-300">PayPal Not Configured</h3>
        <p className="text-yellow-200 mt-2">Please add your PayPal Client ID to your environment variables to enable this feature.</p>
      </div>
    );
  }

  return (
    <Card className="celestial-bg border-yellow-400/20 max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-yellow-300 sacred-font">Donate with PayPal</CardTitle>
        <CardDescription className="text-blue-300">Make a secure one-time or recurring donation.</CardDescription>
      </CardHeader>
      <CardContent>
        <PayPalScriptProvider options={{ 'client-id': paypalClientId, vault: true, intent: 'subscription' }}>
          <PayPalButtons
            style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'donate' }}
            createSubscription={(data, actions) => {
              // This is a placeholder subscription plan ID. 
              // You must create a subscription plan in your PayPal developer dashboard.
              // https://developer.paypal.com/dashboard/billing/plans
              const planId = 'P-YOUR_PLAN_ID'; 
              
              if(planId === 'P-YOUR_PLAN_ID') {
                toast({
                  title: 'PayPal Plan Not Configured',
                  description: 'Please create a billing plan in your PayPal dashboard and add the ID.',
                  variant: 'destructive'
                });
                return Promise.reject(new Error('Plan ID not configured.'));
              }

              return actions.subscription.create({
                plan_id: planId,
              });
            }}
            onApprove={(data, actions) => {
              toast({
                title: 'Subscription Approved!',
                description: `Your recurring donation is now active. Subscription ID: ${data.subscriptionID}`,
                className: 'bg-green-800 text-white',
              });
              // Here you would typically save the subscriptionID to your database
              // associated with the user.
              return Promise.resolve();
            }}
            onError={(err) => {
              toast({
                title: 'PayPal Error',
                description: 'An error occurred with your donation. Please try again.',
                variant: 'destructive',
              });
              console.error('PayPal Checkout onError', err);
            }}
            createOrder={(data, actions) => {
              // This is for one-time donations.
              // The recurring donation flow is handled by createSubscription.
              // We can hide the one-time button if we only want subscriptions.
              // For now, we'll just show a toast.
              toast({
                title: "🚧 One-time PayPal donations are not fully implemented.",
                description: "Please use the subscription option or another payment method.",
              });
              return Promise.reject(new Error("One-time donation not implemented."));
            }}
          />
        </PayPalScriptProvider>
        <p className="text-xs text-blue-400 mt-4 text-center">
          Note: PayPal integration requires a valid Client ID and a pre-configured Billing Plan ID for subscriptions.
        </p>
      </CardContent>
    </Card>
  );
};

export default PaypalDonate;