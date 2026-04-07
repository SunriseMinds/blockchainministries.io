import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Send } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";

const ContactForm = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    inquiryType: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value) => {
    setFormData((prev) => ({ ...prev, inquiryType: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.inquiryType) {
        toast({
            title: "Validation Error",
            description: "Please select an inquiry type.",
            variant: "destructive",
        });
        return;
    }
    setIsSubmitting(true);

    try {
      const { name, email, inquiryType, message } = formData;
      const { error } = await supabase
        .from("contact_inquiries")
        .insert([{ name, email, message, inquiry_type: inquiryType }]);

      if (error) throw error;

      toast({
        title: "✉️ Message Sent!",
        description: "Thank you for reaching out. We will respond as soon as possible.",
        className: "bg-blue-950/80 border-yellow-400 text-white backdrop-blur-md",
      });
      setFormData({ name: "", email: "", inquiryType: "", message: "" });
    } catch (error) {
      console.error("Error submitting contact form: ", error);
      toast({
        title: "Error",
        description: "Could not send message. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="max-w-3xl mx-auto bg-slate-900/50 border border-yellow-600/50 rounded-2xl p-8 space-y-6 shadow-2xl shadow-yellow-500/10 backdrop-blur-sm"
    >
      <div className="text-center">
        <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 sacred-font">
          Send a Transmission
        </h2>
        <p className="text-blue-200 mt-2">
          Use this sacred channel for all inquiries and communications.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            type="text"
            name="name"
            placeholder="Your Name or Title"
            value={formData.name}
            onChange={handleChange}
            required
            className="bg-slate-800/50 border-yellow-400/30 text-white placeholder:text-blue-300/70 focus:border-yellow-400"
          />
          <Input
            type="email"
            name="email"
            placeholder="Your Secure Email"
            value={formData.email}
            onChange={handleChange}
            required
            className="bg-slate-800/50 border-yellow-400/30 text-white placeholder:text-blue-300/70 focus:border-yellow-400"
          />
        </div>
        <Select onValueChange={handleSelectChange} value={formData.inquiryType} required>
          <SelectTrigger className="w-full bg-slate-800/50 border-yellow-400/30 text-white focus:border-yellow-400">
            <SelectValue placeholder="Select Inquiry Type..." />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-yellow-500 text-white">
            <SelectItem value="General Inquiry">General Inquiry</SelectItem>
            <SelectItem value="Partnership">Partnership Proposal</SelectItem>
            <SelectItem value="Diplomatic Relations">Diplomatic Relations</SelectItem>
            <SelectItem value="Press">Press & Media</SelectItem>
            <SelectItem value="Scroll Request">Scroll Request</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          name="message"
          placeholder="Your sacred message..."
          rows={5}
          value={formData.message}
          onChange={handleChange}
          required
          className="bg-slate-800/50 border-yellow-400/30 text-white placeholder:text-blue-300/70 focus:border-yellow-400"
        />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-yellow-500/20"
        >
          {isSubmitting ? "Transmitting..." : "Send Transmission"}
          <Send className="ml-2 h-4 w-4" />
        </Button>
      </form>
    </motion.div>
  );
};

export default ContactForm;