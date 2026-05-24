import React from 'react';

interface FormSectionProps {
    title: string;
    children: React.ReactNode;
}

const FormSection: React.FC<FormSectionProps> = ({ title, children }) => {
    return (
        <div className="form-section">
            <div className="section-title">{title}</div>
            {children}
        </div>
    );
};

export default FormSection;
