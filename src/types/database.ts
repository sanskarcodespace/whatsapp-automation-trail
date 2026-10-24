// Database type definitions matching the Supabase schema
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string
          name: string
          phone_number_id: string | null
          waba_id: string | null
          is_active: boolean
          connection_status: 'pending' | 'connected' | 'error' | 'disconnected'
          services: string | null
          products: string | null
          prices: string | null
          faqs: string | null
          opening_hours: string | null
          contact_details: string | null
          ai_tone: string | null
          booking_system: string | null
          handoff_message: string | null
          system_prompt: string | null
          settings: Json | null
          timezone: string
          supported_languages: string[]
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['businesses']['Row']>
        Update: Partial<Database['public']['Tables']['businesses']['Row']>
        Relationships: []
      }
      business_members: {
        Row: {
          id: string
          business_id: string
          user_id: string
          role: 'platform_admin' | 'owner' | 'manager' | 'agent'
          invited_by: string | null
          accepted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['business_members']['Row']>
        Update: Partial<Database['public']['Tables']['business_members']['Row']>
        Relationships: []
      }
      wa_messages: {
        Row: {
          id: string
          wa_message_id: string | null
          message_id: string | null
          quoted_message_id: string | null
          direction: 'inbound' | 'outbound'
          session_id: string | null
          phone_number_id: string | null
          customer_phone: string | null
          customer_name: string | null
          body: string | null
          message_timestamp: string | null
          status: string | null
          business_id: string | null
          intent: string | null
          lead_status: string | null
          metadata: Json | null
          read_at: string | null
          agent_id: string | null
          is_manual_reply: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['wa_messages']['Row']>
        Update: Partial<Database['public']['Tables']['wa_messages']['Row']>
        Relationships: []
      }
      conversations: {
        Row: {
          id: string | null
          session_id: string
          business_id: string | null
          phone_number_id: string | null
          customer_phone: string | null
          customer_name: string | null
          human_takeover: boolean
          status: string | null
          last_message?: string | null
          last_inbound_at: string | null
          last_message_at: string | null
          assigned_agent_id: string | null
          unread_count: number
          tags: string[]
          created_at: string
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['conversations']['Row']>
        Update: Partial<Database['public']['Tables']['conversations']['Row']>
        Relationships: []
      }
      leads: {
        Row: {
          id: string | null
          business_id: string | null
          customer_phone: string | null
          customer_name: string | null
          interested_service: string | null
          preferred_bhk: string | null
          preferred_location: string | null
          property_type: string | null
          timeline: string | null
          possession_type: string | null
          requirements: string | null
          preferred_appointment_time: string | null
          last_intent: string | null
          last_message_at: string | null
          status: string | null
          assigned_agent_id: string | null
          follow_up_date: string | null
          notes: string | null
          budget: string | null
          location: string | null
          source_session_id: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['leads']['Row']>
        Update: Partial<Database['public']['Tables']['leads']['Row']>
        Relationships: []
      }
      appointment_requests: {
        Row: {
          id: string
          business_id: string | null
          customer_phone: string | null
          customer_name: string | null
          service: string | null
          requested_time: string | null
          status: string | null
          source_message_id: string | null
          assigned_staff_id: string | null
          appointment_type: string | null
          timezone: string
          confirmed_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['appointment_requests']['Row']>
        Update: Partial<Database['public']['Tables']['appointment_requests']['Row']>
        Relationships: []
      }
      escalations: {
        Row: {
          id: string
          business_id: string | null
          session_id: string | null
          customer_phone: string | null
          reason: string | null
          source_message_id: string | null
          status: string | null
          created_at: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: Partial<Database['public']['Tables']['escalations']['Row']>
        Update: Partial<Database['public']['Tables']['escalations']['Row']>
        Relationships: []
      }
      response_style_profiles: {
        Row: {
          id: string
          business_id: string
          approved: boolean
          style_notes: string | null
          example_customer: string | null
          example_reply: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['response_style_profiles']['Row']>
        Update: Partial<Database['public']['Tables']['response_style_profiles']['Row']>
        Relationships: []
      }
      internal_notes: {
        Row: {
          id: string
          business_id: string
          session_id: string | null
          author_id: string
          body: string
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['internal_notes']['Row']>
        Update: Partial<Database['public']['Tables']['internal_notes']['Row']>
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          business_id: string | null
          actor_id: string | null
          action: string
          target_type: string | null
          target_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['audit_log']['Row']>
        Update: Partial<Database['public']['Tables']['audit_log']['Row']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      crm_record_connection_check: {
        Args: { p_actor_id: string; p_business_id: string; p_phone_number_id: string; p_waba_id: string }
        Returns: boolean
      }
      crm_manage_client: {
        Args: { p_actor_id: string; p_action: string; p_business_id?: string; p_payload: Json }
        Returns: Json
      }
      crm_save_ai_settings: {
        Args: { p_actor_id: string; p_business_id: string; p_settings: Json; p_system_prompt?: string; p_style?: Json }
        Returns: Json
      }
      get_my_business_ids: {
        Args: Record<string, never>
        Returns: string[]
      }
      is_platform_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
