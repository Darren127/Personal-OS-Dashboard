
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_action_logs": {
                  Row: {
                    "before_state": Json | null,"conversation_id": string | null,"created_at": string,"decided_at": string | null,"entity_id": string | null,"entity_type": string | null,"error": string | null,"executed_at": string | null,"id": string,"input": NonNullable<Json>,"message_id": string | null,"result": Json | null,"risk_level": Database["public"]['Enums']["ai_risk_level"],"status": Database["public"]['Enums']["ai_action_status"],"summary": string | null,"tool_name": string,"tool_use_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "before_state"?: Json | null,"conversation_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"error"?: string | null,"executed_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"message_id"?: string | null,"result"?: Json | null,"risk_level"?: Database["public"]['Enums']["ai_risk_level"],"status"?: Database["public"]['Enums']["ai_action_status"],"summary"?: string | null,"tool_name": string,"tool_use_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "before_state"?: Json | null,"conversation_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"error"?: string | null,"executed_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"message_id"?: string | null,"result"?: Json | null,"risk_level"?: Database["public"]['Enums']["ai_risk_level"],"status"?: Database["public"]['Enums']["ai_action_status"],"summary"?: string | null,"tool_name"?: string,"tool_use_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_action_logs_conversation_id_user_id_fkey"
      columns: ["conversation_id","user_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "ai_action_logs_message_id_user_id_fkey"
      columns: ["message_id","user_id"]
isOneToOne: false
      referencedRelation: "conversation_messages"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"conversation_messages": {
                  Row: {
                    "cache_creation_input_tokens": number | null,"cache_read_input_tokens": number | null,"content": NonNullable<Json>,"conversation_id": string,"created_at": string,"id": string,"input_tokens": number | null,"model": string | null,"output_tokens": number | null,"role": string,"search": unknown,"seq": number,"stop_reason": string | null,"text_content": string,"user_id": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_creation_input_tokens"?: number | null,"cache_read_input_tokens"?: number | null,"content"?: NonNullable<Json>,"conversation_id": string,"created_at"?: string,"id"?: string,"input_tokens"?: number | null,"model"?: string | null,"output_tokens"?: number | null,"role": string,"search"?: never,"seq"?: never,"stop_reason"?: string | null,"text_content"?: string,"user_id"?: string,"visible"?: boolean
                  }
                  Update: {
                    "cache_creation_input_tokens"?: number | null,"cache_read_input_tokens"?: number | null,"content"?: NonNullable<Json>,"conversation_id"?: string,"created_at"?: string,"id"?: string,"input_tokens"?: number | null,"model"?: string | null,"output_tokens"?: number | null,"role"?: string,"search"?: never,"seq"?: never,"stop_reason"?: string | null,"text_content"?: string,"user_id"?: string,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_messages_conversation_id_user_id_fkey"
      columns: ["conversation_id","user_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"kind": string,"title": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"daily_plan_items": {
                  Row: {
                    "created_at": string,"end_time": string | null,"id": string,"outcome": Database["public"]['Enums']["plan_item_outcome"] | null,"plan_id": string,"priority_rank": number | null,"start_time": string | null,"task_id": string | null,"title": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_time"?: string | null,"id"?: string,"outcome"?: Database["public"]['Enums']["plan_item_outcome"] | null,"plan_id": string,"priority_rank"?: number | null,"start_time"?: string | null,"task_id"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"end_time"?: string | null,"id"?: string,"outcome"?: Database["public"]['Enums']["plan_item_outcome"] | null,"plan_id"?: string,"priority_rank"?: number | null,"start_time"?: string | null,"task_id"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_plan_items_plan_id_user_id_fkey"
      columns: ["plan_id","user_id"]
isOneToOne: false
      referencedRelation: "daily_plans"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "daily_plan_items_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"daily_plans": {
                  Row: {
                    "available_minutes": number | null,"created_at": string,"id": string,"intention": string | null,"notes": string | null,"plan_date": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "available_minutes"?: number | null,"created_at"?: string,"id"?: string,"intention"?: string | null,"notes"?: string | null,"plan_date": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "available_minutes"?: number | null,"created_at"?: string,"id"?: string,"intention"?: string | null,"notes"?: string | null,"plan_date"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"daily_reviews": {
                  Row: {
                    "challenges": string | null,"created_at": string,"energy": number | null,"id": string,"lessons": string | null,"mood": number | null,"review_date": string,"tomorrow_focus": string | null,"updated_at": string,"user_id": string,"wins": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "challenges"?: string | null,"created_at"?: string,"energy"?: number | null,"id"?: string,"lessons"?: string | null,"mood"?: number | null,"review_date": string,"tomorrow_focus"?: string | null,"updated_at"?: string,"user_id"?: string,"wins"?: string | null
                  }
                  Update: {
                    "challenges"?: string | null,"created_at"?: string,"energy"?: number | null,"id"?: string,"lessons"?: string | null,"mood"?: number | null,"review_date"?: string,"tomorrow_focus"?: string | null,"updated_at"?: string,"user_id"?: string,"wins"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"goal_milestones": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"description": string | null,"due_date": string | null,"goal_id": string,"id": string,"position": number,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"goal_id": string,"id"?: string,"position"?: number,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"goal_id"?: string,"id"?: string,"position"?: number,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_milestones_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goal_progress"
      referencedColumns: ["goal_id","user_id"]
    },{
      foreignKeyName: "goal_milestones_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"goal_reviews": {
                  Row: {
                    "created_at": string,"goal_id": string,"id": string,"notes": string,"progress_snapshot": number | null,"review_date": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"goal_id": string,"id"?: string,"notes": string,"progress_snapshot"?: number | null,"review_date"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"goal_id"?: string,"id"?: string,"notes"?: string,"progress_snapshot"?: number | null,"review_date"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_reviews_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goal_progress"
      referencedColumns: ["goal_id","user_id"]
    },{
      foreignKeyName: "goal_reviews_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "achieved_at": string | null,"category": Database["public"]['Enums']["goal_category"],"created_at": string,"description": string | null,"horizon": Database["public"]['Enums']["goal_horizon"],"id": string,"manual_progress": number | null,"metric_current": number | null,"metric_name": string | null,"metric_start": number | null,"metric_target": number | null,"metric_unit": string | null,"parent_goal_id": string | null,"progress_method": Database["public"]['Enums']["progress_method"],"status": Database["public"]['Enums']["goal_status"],"success_criteria": string | null,"target_date": string | null,"title": string,"updated_at": string,"user_id": string,"why_it_matters": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "achieved_at"?: string | null,"category"?: Database["public"]['Enums']["goal_category"],"created_at"?: string,"description"?: string | null,"horizon"?: Database["public"]['Enums']["goal_horizon"],"id"?: string,"manual_progress"?: number | null,"metric_current"?: number | null,"metric_name"?: string | null,"metric_start"?: number | null,"metric_target"?: number | null,"metric_unit"?: string | null,"parent_goal_id"?: string | null,"progress_method"?: Database["public"]['Enums']["progress_method"],"status"?: Database["public"]['Enums']["goal_status"],"success_criteria"?: string | null,"target_date"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string,"why_it_matters"?: string | null
                  }
                  Update: {
                    "achieved_at"?: string | null,"category"?: Database["public"]['Enums']["goal_category"],"created_at"?: string,"description"?: string | null,"horizon"?: Database["public"]['Enums']["goal_horizon"],"id"?: string,"manual_progress"?: number | null,"metric_current"?: number | null,"metric_name"?: string | null,"metric_start"?: number | null,"metric_target"?: number | null,"metric_unit"?: string | null,"parent_goal_id"?: string | null,"progress_method"?: Database["public"]['Enums']["progress_method"],"status"?: Database["public"]['Enums']["goal_status"],"success_criteria"?: string | null,"target_date"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"why_it_matters"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_parent_goal_id_user_id_fkey"
      columns: ["parent_goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goal_progress"
      referencedColumns: ["goal_id","user_id"]
    },{
      foreignKeyName: "goals_parent_goal_id_user_id_fkey"
      columns: ["parent_goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"memories": {
                  Row: {
                    "category": Database["public"]['Enums']["memory_category"],"confidence": Database["public"]['Enums']["memory_confidence"],"content": string,"created_at": string,"created_by": string,"evidence_count": number,"id": string,"importance": number,"last_referenced_at": string | null,"search": unknown,"source_conversation_id": string | null,"status": Database["public"]['Enums']["memory_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["memory_category"],"confidence"?: Database["public"]['Enums']["memory_confidence"],"content": string,"created_at"?: string,"created_by"?: string,"evidence_count"?: number,"id"?: string,"importance"?: number,"last_referenced_at"?: string | null,"search"?: never,"source_conversation_id"?: string | null,"status"?: Database["public"]['Enums']["memory_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["memory_category"],"confidence"?: Database["public"]['Enums']["memory_confidence"],"content"?: string,"created_at"?: string,"created_by"?: string,"evidence_count"?: number,"id"?: string,"importance"?: number,"last_referenced_at"?: string | null,"search"?: never,"source_conversation_id"?: string | null,"status"?: Database["public"]['Enums']["memory_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memories_source_conversation_id_user_id_fkey"
      columns: ["source_conversation_id","user_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"project_blockers": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"project_id": string,"resolved_at": string | null,"task_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"project_id": string,"resolved_at"?: string | null,"task_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"project_id"?: string,"resolved_at"?: string | null,"task_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_blockers_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "project_progress"
      referencedColumns: ["project_id","user_id"]
    },{
      foreignKeyName: "project_blockers_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "project_blockers_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"project_goals": {
                  Row: {
                    "created_at": string,"goal_id": string,"project_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"goal_id": string,"project_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"goal_id"?: string,"project_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_goals_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goal_progress"
      referencedColumns: ["goal_id","user_id"]
    },{
      foreignKeyName: "project_goals_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "project_goals_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "project_progress"
      referencedColumns: ["project_id","user_id"]
    },{
      foreignKeyName: "project_goals_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"project_milestones": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"description": string | null,"due_date": string | null,"id": string,"position": number,"project_id": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"position"?: number,"project_id": string,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"position"?: number,"project_id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_milestones_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "project_progress"
      referencedColumns: ["project_id","user_id"]
    },{
      foreignKeyName: "project_milestones_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"project_reviews": {
                  Row: {
                    "created_at": string,"id": string,"notes": string,"progress_snapshot": number | null,"project_id": string,"review_date": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"notes": string,"progress_snapshot"?: number | null,"project_id": string,"review_date"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"notes"?: string,"progress_snapshot"?: number | null,"project_id"?: string,"review_date"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_reviews_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "project_progress"
      referencedColumns: ["project_id","user_id"]
    },{
      foreignKeyName: "project_reviews_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"description": string | null,"id": string,"name": string,"notes": string | null,"objective": string | null,"priority": Database["public"]['Enums']["priority_level"],"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"target_date": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"objective"?: string | null,"priority"?: Database["public"]['Enums']["priority_level"],"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"target_date"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"objective"?: string | null,"priority"?: Database["public"]['Enums']["priority_level"],"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"target_date"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tasks": {
                  Row: {
                    "actual_minutes": number | null,"completed_at": string | null,"created_at": string,"description": string | null,"due_date": string | null,"estimated_minutes": number | null,"goal_id": string | null,"goal_milestone_id": string | null,"id": string,"priority": Database["public"]['Enums']["priority_level"],"project_id": string | null,"project_milestone_id": string | null,"reschedule_count": number,"scheduled_start": string | null,"start_date": string | null,"status": Database["public"]['Enums']["task_status"],"tags": (string)[],"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_minutes"?: number | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"estimated_minutes"?: number | null,"goal_id"?: string | null,"goal_milestone_id"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["priority_level"],"project_id"?: string | null,"project_milestone_id"?: string | null,"reschedule_count"?: number,"scheduled_start"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"tags"?: (string)[],"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "actual_minutes"?: number | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"estimated_minutes"?: number | null,"goal_id"?: string | null,"goal_milestone_id"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["priority_level"],"project_id"?: string | null,"project_milestone_id"?: string | null,"reschedule_count"?: number,"scheduled_start"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"tags"?: (string)[],"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goal_progress"
      referencedColumns: ["goal_id","user_id"]
    },{
      foreignKeyName: "tasks_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_goal_milestone_id_user_id_fkey"
      columns: ["goal_milestone_id","user_id"]
isOneToOne: false
      referencedRelation: "goal_milestones"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "project_progress"
      referencedColumns: ["project_id","user_id"]
    },{
      foreignKeyName: "tasks_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_project_milestone_id_user_id_fkey"
      columns: ["project_milestone_id","user_id"]
isOneToOne: false
      referencedRelation: "project_milestones"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "ai_auto_execute_low_risk": boolean,"ai_model": string | null,"created_at": string,"display_name": string | null,"timezone": string,"updated_at": string,"user_id": string,"week_starts_on": number,"work_day_end": string,"work_day_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_auto_execute_low_risk"?: boolean,"ai_model"?: string | null,"created_at"?: string,"display_name"?: string | null,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"week_starts_on"?: number,"work_day_end"?: string,"work_day_start"?: string
                  }
                  Update: {
                    "ai_auto_execute_low_risk"?: boolean,"ai_model"?: string | null,"created_at"?: string,"display_name"?: string | null,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"week_starts_on"?: number,"work_day_end"?: string,"work_day_start"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "ai_usage_monthly": {
                  Row: {
                    "cache_creation_input_tokens": number | null,"cache_read_input_tokens": number | null,"input_tokens": number | null,"model": string | null,"month": string | null,"output_tokens": number | null,"requests": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"goal_progress": {
                  Row: {
                    "goal_id": string,"metric_pct": number | null,"milestones_done": number | null,"milestones_total": number | null,"progress": number | null,"progress_source": string | null,"tasks_done": number | null,"tasks_total": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"project_progress": {
                  Row: {
                    "milestones_done": number | null,"milestones_total": number | null,"next_milestone_due": string | null,"open_blockers": number | null,"progress": number | null,"progress_source": string | null,"project_id": string,"tasks_done": number | null,"tasks_total": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "ai_action_status": "proposed"|"approved"|"rejected"|"executed"|"failed","ai_risk_level": "low"|"high","goal_category": "career"|"finance"|"health_fitness"|"learning"|"personal_growth"|"relationships"|"business"|"other","goal_horizon": "long_term"|"annual"|"quarterly"|"short_term","goal_status": "not_started"|"active"|"on_hold"|"achieved"|"abandoned","memory_category": "preference"|"long_term_goal"|"working_style"|"recurring_obstacle"|"decision"|"lesson"|"behavioural_observation","memory_confidence": "confirmed"|"hypothesis","memory_status": "proposed"|"approved"|"rejected"|"archived","plan_item_outcome": "done"|"partial"|"skipped"|"moved","priority_level": "low"|"medium"|"high"|"critical","progress_method": "auto"|"metric"|"milestones"|"tasks"|"manual","project_status": "planning"|"active"|"on_hold"|"completed"|"cancelled","task_status": "inbox"|"next"|"in_progress"|"waiting"|"done"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "ai_action_status": ["proposed", "approved", "rejected", "executed", "failed"],"ai_risk_level": ["low", "high"],"goal_category": ["career", "finance", "health_fitness", "learning", "personal_growth", "relationships", "business", "other"],"goal_horizon": ["long_term", "annual", "quarterly", "short_term"],"goal_status": ["not_started", "active", "on_hold", "achieved", "abandoned"],"memory_category": ["preference", "long_term_goal", "working_style", "recurring_obstacle", "decision", "lesson", "behavioural_observation"],"memory_confidence": ["confirmed", "hypothesis"],"memory_status": ["proposed", "approved", "rejected", "archived"],"plan_item_outcome": ["done", "partial", "skipped", "moved"],"priority_level": ["low", "medium", "high", "critical"],"progress_method": ["auto", "metric", "milestones", "tasks", "manual"],"project_status": ["planning", "active", "on_hold", "completed", "cancelled"],"task_status": ["inbox", "next", "in_progress", "waiting", "done", "cancelled"]
          }
        }
} as const
