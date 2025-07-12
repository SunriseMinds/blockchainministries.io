import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Paperclip } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";

const ContactScrollForm = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    requestType: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value) => {
    setFormData((prev) => ({ ...prev, requestType: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.requestType) {
        toast({
            title: "Validation Error",
            description: "Please select a scroll type.",
            variant: "destructive",
        });
        return;
    }
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("scroll_requests")
        .insert([{ 
            name: formData.name, 
            email: formData.email, 
            request_type: formData.requestType, 
            message: formData.message 
        }]);

      if (error) throw error;

      toast({
        title: "📜 Request Sent!",
        description: "Your scroll request has been received. We will be in touch shortly.",
        className: "bg-blue-950/80 border-yellow-400 text-white backdrop-blur-md",
      });
      setFormData({ name: "", email: "", requestType: "", message: "" });
    } catch (error) {
      console.error("Error submitting scroll request: ", error);
      toast({
        title: "Error",
        description: "Could not send request. Please try again later.",
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
          Request a Sacred Scroll
        </h2>
        <p className="text-blue-200 mt-2">
          If a scroll you seek is not in our public archive, you may request it here.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            type="text"
            name="name"
            placeholder="Your Full Name"
            value={formData.name}
            onChange={handleChange}
            required
            className="bg-slate-800/50 border-yellow-400/30 text-white placeholder:text-blue-300/70 focus:border-yellow-400"
          />
          <Input
            type="email"
            name="email"
            placeholder="Your Email Address"
            value={formData.email}
            onChange={handleChange}
            required
            className="bg-slate-800/50 border-yellow-400/30 text-white placeholder:text-blue-300/70 focus:border-yellow-400"
          />
        </div>
        <Select onValueChange={handleSelectChange} value={formData.requestType} required>
          <SelectTrigger className="w-full bg-slate-800/50 border-yellow-400/30 text-white focus:border-yellow-400">
            <SelectValue placeholder="Select Scroll Type..." />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-yellow-500 text-white">
            <SelectItem value="Membership Scroll">Membership Scroll</SelectItem>
            <SelectItem value="Trust Declaration">Trust Declaration</SelectItem>
            <SelectItem value="Bylaws & Governance">Bylaws & Governance</SelectItem>
            <SelectItem value="Diplomatic Credentials">Diplomatic Credentials</SelectItem>
            <SelectItem value="Spiritual Scroll (Custom)">Spiritual Scroll (Custom)</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          name="message"
          placeholder="Please provide details about your request..."
          rows={5}
          value={formData.message}
          onChange={handleChange}
          className="bg-slate-800/50 border-yellow-400/30 text-white placeholder:text-blue-300/70 focus:border-yellow-400"
        />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-yellow-500/20"
        >
          {isSubmitting ? "Submitting..." : "Submit Request"}
          <Paperclip className="ml-2 h-4 w-4" />
        </Button>
      </form>
    </motion.div>
  );
};

export default ContactScrollForm;
