import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartData {
  name: string;
  value: number;
}

interface DonutChartComponentProps {
  data: ChartData[];
  title: string;
  colors: string[];
}

const DonutChartComponent: React.FC<DonutChartComponentProps> = ({ data, title, colors }) => {
  const totalValue = data.reduce((sum, entry) => sum + entry.value, 0);

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
    if (value === 0) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="font-bold text-base">
        {value}
      </text>
    );
  };

  const legendItems = data
    .map((entry, index) => ({ name: entry.name, value: entry.value, color: colors[index % colors.length] }))
    .filter((item) => item.value > 0);

  return (
    <Card>
      <CardHeader className="pt-3 pb-1 px-3">
        <CardTitle className="text-center text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3 px-3">
        <div className="w-full h-40 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              />
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                innerRadius={44}
                outerRadius={70}
                fill="#8884d8"
                paddingAngle={4}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        {totalValue > 0 && legendItems.length > 0 && (
          <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs leading-tight text-gray-700">
            {legendItems.map((item) => (
              <li key={item.name} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">{item.name}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default DonutChartComponent;
