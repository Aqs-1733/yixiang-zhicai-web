-- MySQL 8.0+; application tables only. No credentials or user data.
CREATE TABLE IF NOT EXISTS health_metrics(
          id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,bp VARCHAR(32) DEFAULT '',hr INT DEFAULT 0,
          weight DECIMAL(10,2) DEFAULT 0,sleep VARCHAR(32) DEFAULT '',steps VARCHAR(32) DEFAULT '',updated_at VARCHAR(32) NOT NULL,
          INDEX idx_health_metrics_user(user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS elder_profiles(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL UNIQUE, age INT NULL,
          monthly_income DECIMAL(18,2) DEFAULT 0, monthly_expense DECIMAL(18,2) DEFAULT 0,
          liquid_asset DECIMAL(18,2) DEFAULT 0, fixed_asset DECIMAL(18,2) DEFAULT 0, debt DECIMAL(18,2) DEFAULT 0,
          risk_preference VARCHAR(32) DEFAULT '', health_status VARCHAR(64) DEFAULT '', phone_difficulty VARCHAR(64) DEFAULT '',
          child_support VARCHAR(64) DEFAULT '', liquidity_need VARCHAR(64) DEFAULT '', pension_goal VARCHAR(255) DEFAULT '',
          emergency_months INT DEFAULT 0, updated_at VARCHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS child_profiles(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL UNIQUE, relation_default VARCHAR(32) DEFAULT '子女',
          emergency_contact VARCHAR(64) DEFAULT '', notify_preference VARCHAR(64) DEFAULT 'risk_alert',
          created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_bind_codes(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, code_hash VARCHAR(128) NOT NULL,
          code_plain_demo VARCHAR(12) DEFAULT '', expires_at VARCHAR(32) NOT NULL, used TINYINT NOT NULL DEFAULT 0,
          created_at VARCHAR(32) NOT NULL, INDEX idx_bind_code_elder(elder_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_bindings(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, child_user_id BIGINT NOT NULL,
          relation VARCHAR(32) DEFAULT '子女', child_name VARCHAR(64) DEFAULT '', child_phone VARCHAR(32) DEFAULT '',
          status VARCHAR(16) NOT NULL DEFAULT 'pending', bind_code_id BIGINT NULL,
          created_at VARCHAR(32) NOT NULL, confirmed_at VARCHAR(32) NULL, updated_at VARCHAR(32) NOT NULL,
          INDEX idx_family_binding_elder(elder_user_id), INDEX idx_family_binding_child(child_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_permissions(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, binding_id BIGINT NOT NULL, permission_key VARCHAR(64) NOT NULL,
          enabled TINYINT NOT NULL DEFAULT 1, updated_at VARCHAR(32) NOT NULL,
          UNIQUE KEY uniq_permission(binding_id, permission_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_messages(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, from_user_id BIGINT NOT NULL,
          to_user_id BIGINT NOT NULL, content TEXT NOT NULL, message_type VARCHAR(32) DEFAULT 'family',
          status VARCHAR(16) DEFAULT 'unread', created_at VARCHAR(32) NOT NULL,
          INDEX idx_family_msg_elder(elder_user_id), INDEX idx_family_msg_to_user(to_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_group_messages(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, family_id BIGINT NOT NULL, sender_id BIGINT NOT NULL,
          sender_name VARCHAR(64) DEFAULT '', sender_role VARCHAR(16) DEFAULT '', content TEXT NOT NULL,
          message_type VARCHAR(16) DEFAULT 'user', created_at VARCHAR(32) NOT NULL,
          INDEX idx_family_group_family(family_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_group_reads(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL, family_id BIGINT NOT NULL,
          last_read_message_id BIGINT NOT NULL DEFAULT 0, updated_at VARCHAR(32) NOT NULL,
          UNIQUE KEY uniq_family_group_read(user_id, family_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_member_remarks(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, viewer_user_id BIGINT NOT NULL, peer_user_id BIGINT NOT NULL,
          remark VARCHAR(64) DEFAULT '', updated_at VARCHAR(32) NOT NULL,
          UNIQUE KEY uniq_family_remark(viewer_user_id, peer_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS alert_events(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, event_type VARCHAR(64) NOT NULL,
          level VARCHAR(16) NOT NULL, title VARCHAR(128) NOT NULL, detail TEXT, source VARCHAR(64) DEFAULT '',
          related_record_id BIGINT NULL, status VARCHAR(16) DEFAULT 'unread', created_at VARCHAR(32) NOT NULL, handled_at VARCHAR(32) NULL,
          INDEX idx_alert_elder(elder_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS weekly_reports(
          id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, period_start VARCHAR(16) NOT NULL,
          period_end VARCHAR(16) NOT NULL, summary TEXT, asset_summary_json JSON, ledger_summary_json JSON,
          position_summary_json JSON, risk_summary_json JSON, ai_advice TEXT, created_at VARCHAR(32) NOT NULL,
          INDEX idx_weekly_elder(elder_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS questionnaire_templates(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,template_type VARCHAR(32),title VARCHAR(128),description TEXT,source_model VARCHAR(64),created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS questionnaire_questions(id BIGINT PRIMARY KEY AUTO_INCREMENT,template_id BIGINT NOT NULL,question_key VARCHAR(64),title TEXT,`desc` TEXT,terms_json JSON,options_json JSON,order_no INT DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS questionnaire_answers(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,template_id BIGINT NULL,answers_json JSON,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS risk_assessments(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,template_id BIGINT NULL,risk_score INT,risk_level VARCHAR(32),summary TEXT,suggestion_json JSON,model_used VARCHAR(64),created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS input_attachments(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,scene VARCHAR(64),input_type VARCHAR(16),file_path TEXT,original_name TEXT,mime_type VARCHAR(128),size BIGINT,sha256 VARCHAR(128),extracted_text TEXT,parsed_json JSON,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ledger_imports(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,source VARCHAR(64),raw_text TEXT,parsed_json JSON,duplicate_count INT DEFAULT 0,imported_count INT DEFAULT 0,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS wealth_position_snapshots(id BIGINT PRIMARY KEY AUTO_INCREMENT,position_id BIGINT NOT NULL,current_net_value DECIMAL(18,6),estimated_value DECIMAL(18,2),profit_amount DECIMAL(18,2),profit_rate DECIMAL(18,4),risk_status VARCHAR(32),source VARCHAR(64),raw_info JSON,snapshot_date VARCHAR(16),created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS term_explain_cache(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,term VARCHAR(64),scene VARCHAR(64),nearby_text TEXT,explanation TEXT,risk_tip TEXT,model_used VARCHAR(64),created_at VARCHAR(32) NOT NULL,expires_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS llm_call_logs(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,provider VARCHAR(64),model VARCHAR(128),scene VARCHAR(64),prompt_hash VARCHAR(128),input_summary TEXT,output_summary TEXT,success TINYINT,error_message TEXT,latency_ms INT,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS audit_logs(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,action VARCHAR(64),target_type VARCHAR(64),target_id VARCHAR(64),detail_json JSON,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS account_security_questions(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL UNIQUE,question VARCHAR(255) NOT NULL,answer_hash VARCHAR(128) NOT NULL,created_at VARCHAR(32) NOT NULL,updated_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS pocket_history(
          id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,action VARCHAR(32) NOT NULL,
          summary_json JSON,created_at VARCHAR(32) NOT NULL,INDEX idx_pocket_user(user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS health_journal(
             id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,kind VARCHAR(24) NOT NULL,
             content TEXT,analysis TEXT,image_path TEXT,created_at VARCHAR(32) NOT NULL,
             INDEX idx_health_journal_user(user_id,created_at)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS users(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              phone VARCHAR(20) UNIQUE NOT NULL,
              password_hash VARCHAR(128) NOT NULL,
              nickname VARCHAR(64) NOT NULL,
              role VARCHAR(32) NOT NULL DEFAULT 'elder',
              created_at VARCHAR(32) NOT NULL,
              openid VARCHAR(128) NULL UNIQUE, wechat_bound_at VARCHAR(32) NULL,
              avatar MEDIUMTEXT NULL, status VARCHAR(16) NOT NULL DEFAULT 'active', updated_at VARCHAR(32) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS profiles(
              user_id BIGINT PRIMARY KEY,
              data JSON NOT NULL,
              updated_at VARCHAR(32) NOT NULL,
              CONSTRAINT fk_profiles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ledger_records(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              type VARCHAR(16) NOT NULL,
              title VARCHAR(128) NOT NULL,
              amount DECIMAL(18,2) NOT NULL,
              date DATE NOT NULL,
              category VARCHAR(64) NOT NULL DEFAULT '',
              description TEXT NULL,
              source VARCHAR(32) NOT NULL DEFAULT 'manual',
              created_at VARCHAR(32) NOT NULL,
              INDEX idx_ledger_user_date(user_id, date),
              CONSTRAINT fk_ledger_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS family_members(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              relation VARCHAR(32) NOT NULL,
              phone VARCHAR(32) NOT NULL,
              enabled TINYINT NOT NULL DEFAULT 1,
              permissions JSON NOT NULL,
              created_at VARCHAR(32) NOT NULL,
              INDEX idx_family_user(user_id),
              CONSTRAINT fk_family_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS service_phones(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              type VARCHAR(32) NOT NULL,
              phone VARCHAR(32) NOT NULL,
              INDEX idx_service_user(user_id),
              CONSTRAINT fk_service_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS meds(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              time VARCHAR(16) NOT NULL,
              dose VARCHAR(64) NOT NULL,
              done TINYINT NOT NULL DEFAULT 0,
              alarm TINYINT NOT NULL DEFAULT 0,
              INDEX idx_meds_user(user_id),
              CONSTRAINT fk_meds_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS sport_tasks(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              minutes INT NOT NULL,
              note VARCHAR(255) NOT NULL,
              done TINYINT NOT NULL DEFAULT 0,
              task_date DATE NOT NULL,
              INDEX idx_sport_user_date(user_id, task_date),
              CONSTRAINT fk_sport_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS input_records(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              input_type VARCHAR(32) NOT NULL,
              raw_text TEXT NOT NULL,
              parsed_json JSON NOT NULL,
              created_at VARCHAR(32) NOT NULL,
              INDEX idx_input_user_time(user_id, created_at),
              CONSTRAINT fk_input_records_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS wealth_positions(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              product_name VARCHAR(255) NOT NULL,
              institution VARCHAR(128) NOT NULL,
              product_code VARCHAR(128) NOT NULL DEFAULT '',
              buy_amount DECIMAL(18,2) NOT NULL,
              buy_net_value DECIMAL(18,6) NOT NULL DEFAULT 1,
              current_net_value DECIMAL(18,6) NOT NULL DEFAULT 1,
              buy_date DATE NOT NULL,
              latest_date DATE NOT NULL,
              source VARCHAR(64) NOT NULL,
              raw_info JSON NOT NULL,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL,
              INDEX idx_wealth_user(user_id),
              CONSTRAINT fk_wealth_positions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS product_info_cache(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              query VARCHAR(255) NOT NULL UNIQUE,
              info_json JSON NOT NULL,
              source VARCHAR(64) NOT NULL,
              fetched_at VARCHAR(32) NOT NULL,
              expires_at VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
