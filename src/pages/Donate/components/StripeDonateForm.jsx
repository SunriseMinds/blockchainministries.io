import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Heart, Loader2 } from 'lucide-react';

const StripeDonateForm = ({ setClientSecret }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  const [amount, setAmount] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const createPaymentIntent = async (selectedAmount) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-intent', {
        body: { amount: selectedAmount * 100 }, // amount in cents
      });

      if (error) throw error;

      setClientSecret(data.clientSecret);
    } catch (error) {
      console.error('Error creating payment intent:', error);
      toast({
        title: 'Error',
        description: 'Could not initialize payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAmountChange = (newAmount) => {
    setAmount(newAmount);
    createPaymentIntent(newAmount);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard`,
      },
    });

    if (error.type === "card_error" || error.type === "validation_error") {
      toast({ title: 'Payment Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'An unexpected error occurred.', variant: 'destructive' });
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <Label htmlFor="amount" className="text-yellow-300 sacred-font">Select Amount (USD)</Label>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
          {[25, 50, 100, 250, 500, 1000].map(val => (
            <Button
              key={val}
              type="button"
              variant={amount === val ? "default" : "outline"}
              onClick={() => handleAmountChange(val)}
              className={`border-yellow-400/50 ${amount === val ? 'bg-yellow-500 text-blue-950 hover:bg-yellow-400' : 'text-yellow-300 hover:bg-yellow-400/10'}`}
            >
              ${val}
            </Button>
          ))}
        </div>
        <div className="flex items-center space-x-2">
          <Input
            type="number"
            id="amount"
            placeholder="Custom Amount"
            value={amount}
            onChange={e => handleAmountChange(Number(e.target.value))}
            className="bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
          />
        </div>
      </div>
      
      <div className="space-y-4">
        <Label className="text-yellow-300 sacred-font">Payment Information</Label>
        <div className="p-4 bg-slate-800/50 rounded-lg border border-yellow-600/30">
          <PaymentElement />
        </div>
      </div>

      <Button
        disabled={isLoading || !stripe || !elements}
        type="submit"
        className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold text-lg py-6 disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <>
            Contribute ${amount} with USD <Heart className="ml-2 w-5 h-5" />
          </>
        )}
      </Button>
    </form>
  );
};

export default StripeDonateForm;